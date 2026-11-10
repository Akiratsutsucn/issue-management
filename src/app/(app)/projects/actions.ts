"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { firstError, projectSchema } from "@/lib/validation";
import type { FormState } from "@/app/(app)/issues/actions";
import { writeAudit } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function createProjectAction(customerId: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = projectSchema.safeParse({ name: s(fd, "name"), note: s(fd, "note") });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { error: "客户不存在" };
  let id: string;
  try {
    const p = await prisma.serviceProject.create({ data: { ...parsed.data, customerId } });
    await writeAudit(prisma, { entityType: "project", entityId: p.id, action: "create", actorId: user.id, summary: `新建服务项目 ${p.name}（${customer.name}）` });
    id = p.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "该客户下已有同名服务项目" };
    throw e;
  }
  revalidatePath(`/customers/${customerId}`);
  redirect(`/projects/${id}`);
}

export async function updateProjectAction(projectId: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = projectSchema.safeParse({ name: s(fd, "name"), note: s(fd, "note") });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const before = await prisma.serviceProject.findUnique({ where: { id: projectId } });
  if (!before) return { error: "服务项目不存在" };
  try {
    await prisma.serviceProject.update({ where: { id: projectId }, data: parsed.data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "该客户下已有同名服务项目" };
    throw e;
  }
  await writeAudit(prisma, {
    entityType: "project", entityId: projectId, action: "update", actorId: user.id,
    summary: before.name === parsed.data.name ? `修改服务项目 ${parsed.data.name}` : `服务项目改名：${before.name} → ${parsed.data.name}`,
    before: { name: before.name, note: before.note }, after: parsed.data,
  });
  revalidatePath("/", "layout");
  return { error: "", ok: "已保存" };
}

export async function setProjectStatusAction(projectId: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const archive = s(fd, "op") === "archive";
  const reason = s(fd, "reason").trim().slice(0, 500);
  if (archive && !reason) return { error: "归档须填写理由" };
  const p = await prisma.serviceProject.update({ where: { id: projectId }, data: { status: archive ? "archived" : "active" } });
  await writeAudit(prisma, {
    entityType: "project", entityId: projectId, action: archive ? "archive" : "unarchive", actorId: user.id,
    summary: archive ? `归档服务项目 ${p.name}（理由：${reason}）` : `恢复服务项目 ${p.name}`,
  });
  revalidatePath(`/projects/${projectId}`);
  return { error: "", ok: archive ? "已归档" : "已恢复" };
}
