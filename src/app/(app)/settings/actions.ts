"use server";

import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { firstError, settingsSchema, splitList, userCreateSchema, vocabSchema } from "@/lib/validation";
import type { FormState } from "@/app/(app)/issues/actions";
import { writeAudit } from "@/lib/server/audit";
import { hashPassword, requireAdmin } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");
type Vocab = "priority" | "issueType" | "source";
const VOCABS: Vocab[] = ["priority", "issueType", "source"];

function genPassword(): string {
  return randomBytes(12).toString("base64url");
}

export async function saveSettingsAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const parsed = settingsSchema.safeParse({
    teamName: s(fd, "teamName"),
    reminderDueSoonDays: s(fd, "reminderDueSoonDays"),
    reminderPendingDays: s(fd, "reminderPendingDays"),
    reminderHighNoDueGraceDays: s(fd, "reminderHighNoDueGraceDays"),
    memberCanCreateCustomer: fd.get("memberCanCreateCustomer") === "on",
    maxImageMb: s(fd, "maxImageMb"),
    maxAttachmentMb: s(fd, "maxAttachmentMb"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { maxImageMb, maxAttachmentMb, ...rest } = parsed.data;
  const data = { ...rest, maxImageBytes: maxImageMb * 1048576, maxAttachmentBytes: maxAttachmentMb * 1048576 };
  await prisma.teamSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  await writeAudit(prisma, { entityType: "settings", entityId: "1", action: "update", actorId: user.id, summary: "修改系统设置", after: data });
  revalidatePath("/", "layout");
  return { error: "", ok: "已保存" };
}

function vocabDelegate(kind: Vocab) {
  // 三张词汇表字段一致
  return prisma[kind] as unknown as typeof prisma.priority;
}

export async function saveVocabAction(kind: Vocab, id: string | null, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireAdmin();
  if (!VOCABS.includes(kind)) return { error: "无效词汇表" };
  const parsed = vocabSchema.safeParse({ label: s(fd, "label"), description: s(fd, "description"), color: s(fd, "color"), sortOrder: s(fd, "sortOrder") || "0" });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const d = parsed.data;
  const data = { label: d.label, description: d.description || null, color: d.color || null, sortOrder: d.sortOrder, isActive: fd.get("isActive") !== "off" };
  const del = vocabDelegate(kind);
  if (id) {
    await del.update({ where: { id }, data });
  } else {
    await del.create({ data: { ...data, key: `custom_${randomBytes(4).toString("hex")}` } });
  }
  await writeAudit(prisma, { entityType: kind, entityId: id ?? "new", action: id ? "update" : "create", actorId: user.id, summary: `${id ? "修改" : "新增"}词汇「${d.label}」` });
  revalidatePath("/settings");
  return { error: "", ok: "已保存" };
}

export async function deleteVocabAction(kind: Vocab, id: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireAdmin();
  if (!VOCABS.includes(kind)) return { error: "无效词汇表" };
  const field = kind === "priority" ? "priorityId" : kind === "issueType" ? "issueTypeId" : "sourceId";
  const target = s(fd, "migrateTo");
  const inUse = await prisma.issue.count({ where: { [field]: id } });
  const del = vocabDelegate(kind);
  const cur = await del.findUnique({ where: { id } });
  if (!cur) return { error: "不存在" };
  if (kind === "priority" && cur.key === "high") return { error: "「高」用于提醒规则，可改名但不能删除" };
  if (inUse && !target) return { error: `仍有 ${inUse} 条课题在用，请选择迁移目标` };
  if (target === id) return { error: "迁移目标不能是自身" };
  await prisma.$transaction(async (tx) => {
    if (inUse) await tx.issue.updateMany({ where: { [field]: id }, data: { [field]: target } });
    if (kind === "priority") await tx.customerPriorityOverride.deleteMany({ where: { priorityId: id } });
    await (tx[kind] as unknown as typeof tx.priority).delete({ where: { id } });
    await writeAudit(tx, { entityType: kind, entityId: id, action: "delete", actorId: user.id, summary: `删除词汇「${cur.label}」，${inUse} 条课题迁移` });
  });
  revalidatePath("/settings");
  return { error: "", ok: "已删除" };
}

export async function createUserAction(_p: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = userCreateSchema.safeParse({ email: s(fd, "email"), displayName: s(fd, "displayName"), aliases: s(fd, "aliases"), role: s(fd, "role") });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const pw = genPassword();
  try {
    const u = await prisma.user.create({
      data: { email: parsed.data.email, displayName: parsed.data.displayName, aliases: splitList(parsed.data.aliases), role: parsed.data.role, passwordHash: await hashPassword(pw) },
    });
    await writeAudit(prisma, { entityType: "user", entityId: u.id, action: "create", actorId: admin.id, summary: `新建用户 ${u.email}（${u.role}）` });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "该邮箱已存在" };
    throw e;
  }
  revalidatePath("/settings");
  return { error: "", ok: `已创建。初始密码（只显示这一次）：${pw}` };
}

export async function updateUserAction(userId: string, _p: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const op = s(fd, "op");
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "用户不存在" };
  if (op === "reset") {
    const pw = genPassword();
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(pw), failedLogins: 0, lockedUntil: null } }),
      prisma.session.deleteMany({ where: { userId } }),
    ]);
    await writeAudit(prisma, { entityType: "user", entityId: userId, action: "reset_password", actorId: admin.id, summary: `重置 ${target.email} 的密码` });
    return { error: "", ok: `新密码（只显示这一次）：${pw}` };
  }
  if (op === "toggle") {
    if (userId === admin.id) return { error: "不能停用自己" };
    const isActive = !target.isActive;
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { isActive } }),
      ...(isActive ? [] : [prisma.session.deleteMany({ where: { userId } })]),
    ]);
    await writeAudit(prisma, { entityType: "user", entityId: userId, action: isActive ? "activate" : "deactivate", actorId: admin.id, summary: `${isActive ? "启用" : "停用"}用户 ${target.email}` });
    revalidatePath("/settings");
    return { error: "", ok: isActive ? "已启用" : "已停用" };
  }
  const displayName = s(fd, "displayName").trim().slice(0, 60);
  const role = s(fd, "role") === "admin" ? "admin" : "member";
  if (!displayName) return { error: "请填写显示名" };
  if (userId === admin.id && role !== "admin") return { error: "不能取消自己的管理员身份" };
  await prisma.user.update({ where: { id: userId }, data: { displayName, role, aliases: splitList(s(fd, "aliases")).slice(0, 20) } });
  await writeAudit(prisma, { entityType: "user", entityId: userId, action: "update", actorId: admin.id, summary: `修改用户 ${target.email}` });
  revalidatePath("/settings");
  return { error: "", ok: "已保存" };
}
