// 内部邮箱+密码认证；会话入库，cookie 只存随机令牌，库内存 HMAC
import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { getSettings } from "./settings";

export const SESSION_COOKIE = "idesk_session";
const SESSION_DAYS = 14;
// 不存在的邮箱也做一次比较，避免响应时间暴露邮箱是否存在
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash(randomBytes(16).toString("hex"), 12);
  return dummyHash;
}

export type SessionUser = Pick<User, "id" | "email" | "displayName" | "role" | "listColumns">;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET 未设置或少于 32 位");
  return s;
}

function hashToken(token: string): string {
  return createHmac("sha256", secret()).update(token).digest("hex");
}

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12);
}

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 10) return "密码至少 10 位";
  if (pw.length > 128) return "密码过长";
  return null;
}

export type LoginResult = { ok: true } | { ok: false; error: string };

const GENERIC_FAIL = "邮箱或密码不正确";

export async function login(emailRaw: string, password: string): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  const now = new Date();
  if (!user || !user.isActive) {
    await bcrypt.compare(password, await getDummyHash());
    return { ok: false, error: GENERIC_FAIL };
  }
  if (user.lockedUntil && user.lockedUntil > now) {
    return { ok: false, error: "尝试次数过多，请稍后再试" };
  }
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    const s = await getSettings();
    const failed = user.failedLogins + 1;
    const lock = failed >= s.loginMaxFailures;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: lock ? 0 : failed,
        lockedUntil: lock ? new Date(now.getTime() + s.loginLockMinutes * 60_000) : user.lockedUntil,
      },
    });
    if (lock) {
      await prisma.auditLog.create({ data: { entityType: "user", entityId: user.id, action: "login_locked", summary: "连续登录失败，临时锁定" } });
    }
    return { ok: false, error: GENERIC_FAIL };
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } }),
    prisma.session.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt } }),
  ]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.APP_BASE_URL ?? "").startsWith("https://"),
    path: "/",
    expires: expiresAt,
  });
  return { ok: true };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, displayName: true, role: true, listColumns: true, isActive: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;
  const { isActive: _ignored, ...user } = session.user;
  return user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("仅管理员可操作");
  return user;
}

/** 供 route handler 使用：未登录返回 null 而不是重定向 */
export async function apiUser(): Promise<SessionUser | null> {
  return getSessionUser();
}
