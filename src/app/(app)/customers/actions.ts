"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ymdToDate } from "@/lib/dates";
import { contactSchema, customerSchema, firstError, meetingSchema } from "@/lib/validation";
import type { FormState } from "@/app/(app)/issues/actions";
import { writeAudit } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { getSettings } from "@/lib/server/settings";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function createCustomerAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const settings = await getSettings();
  if (user.role !== "admin" && !settings.memberCanCreateCustomer) return { error: "当前设置不允许成员新建客户" };
  const parsed = customerSchema.safeParse({ name: s(fd, "name"), shortName: s(fd, "shortName"), note: s(fd, "note") });
  if (!parsed.success) return { error: firstError(parsed.error) };
  let id: string;
  try {
    const c = await prisma.customer.create({ data: parsed.data });
    await writeAudit(prisma, { entityType: "customer", entityId: c.id, action: "create", actorId: user.id, summary: `新建客户 ${c.name}` });
    id = c.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "已有同名客户" };
    throw e;
  }
  revalidatePath("/customers");
  redirect(`/customers/${id}`);
}

export async function updateCustomerAction(customerId: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = customerSchema.safeParse({ name: s(fd, "name"), shortName: s(fd, "shortName"), note: s(fd, "note") });
  if (!parsed.success) return { error: firstError(parsed.error) };
  try {
    const before = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    await prisma.customer.update({ where: { id: customerId }, data: parsed.data });
    await writeAudit(prisma, {
      entityType: "customer", entityId: customerId, action: "update", actorId: user.id, summary: `修改客户 ${parsed.data.name}`,
      before: { name: before.name, shortName: before.shortName, note: before.note }, after: parsed.data,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "已有同名客户" };
    throw e;
  }
  revalidatePath(`/customers/${customerId}`);
  return { error: "", ok: "已保存" };
}

export async function setCustomerStatusAction(customerId: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const archive = s(fd, "op") === "archive";
  const reason = s(fd, "reason").trim().slice(0, 500);
  if (archive && !reason) return { error: "归档须填写理由" };
  await prisma.customer.update({ where: { id: customerId }, data: { status: archive ? "archived" : "active" } });
  await writeAudit(prisma, {
    entityType: "customer", entityId: customerId, action: archive ? "archive" : "unarchive", actorId: user.id,
    summary: archive ? `归档客户（理由：${reason}）` : "恢复客户为进行中",
  });
  revalidatePath(`/customers/${customerId}`);
  return { error: "", ok: archive ? "已归档" : "已恢复" };
}

function contactData(fd: FormData) {
  return contactSchema.safeParse({
    name: s(fd, "name"), title: s(fd, "title"), department: s(fd, "department"),
    phone: s(fd, "phone"), email: s(fd, "email"), note: s(fd, "note"),
  });
}

export async function addContactAction(customerId: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = contactData(fd);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const c = await prisma.contact.create({ data: { ...parsed.data, customerId } });
  await writeAudit(prisma, { entityType: "contact", entityId: c.id, action: "create", actorId: user.id, summary: `新建联系人 ${c.name}` });
  revalidatePath(`/customers/${customerId}`);
  return { error: "", ok: "已添加" };
}

export async function updateContactAction(customerId: string, contactId: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = contactData(fd);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const cur = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!cur || cur.customerId !== customerId) return { error: "联系人不存在" };
  await prisma.contact.update({ where: { id: contactId }, data: parsed.data });
  await writeAudit(prisma, { entityType: "contact", entityId: contactId, action: "update", actorId: user.id, summary: `修改联系人 ${parsed.data.name}` });
  revalidatePath(`/customers/${customerId}`);
  return { error: "", ok: "已保存" };
}

function meetingData(fd: FormData) {
  return meetingSchema.safeParse({
    meetingOn: s(fd, "meetingOn"), title: s(fd, "title"), updatedOn: s(fd, "updatedOn"), updaterText: s(fd, "updaterText"),
    informationText: s(fd, "informationText"), fillingNote: s(fd, "fillingNote"),
    sourceDocument: s(fd, "sourceDocument"), divisionNote: s(fd, "divisionNote"),
  });
}

/** 出席：internal:<userId> / contact:<contactId> / 文本行为待补名占位 */
function attendees(fd: FormData) {
  const users = fd.getAll("attUser").map(String).filter(Boolean);
  const contacts = fd.getAll("attContact").map(String).filter(Boolean);
  const placeholders = s(fd, "attPlaceholders").split(/[\n,，、]+/).map((x) => x.trim()).filter(Boolean).slice(0, 30);
  let i = 0;
  return [
    ...users.map((userId) => ({ kind: "internal_user" as const, userId, sortOrder: i++ })),
    ...contacts.map((contactId) => ({ kind: "contact" as const, contactId, sortOrder: i++ })),
    ...placeholders.map((placeholderLabel) => ({ kind: "placeholder" as const, placeholderLabel, sortOrder: i++ })),
  ];
}

export async function saveMeetingAction(customerId: string, meetingId: string | null, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = meetingData(fd);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const d = parsed.data;
  const contactIds = fd.getAll("attContact").map(String).filter(Boolean);
  if (contactIds.length) {
    const n = await prisma.contact.count({ where: { id: { in: contactIds }, customerId } });
    if (n !== contactIds.length) return { error: "出席联系人不属于该客户" };
  }
  const title = d.title || `${d.meetingOn || "未定日期"} 会谈`;
  const data = {
    meetingOn: ymdToDate(d.meetingOn), title, updatedOn: ymdToDate(d.updatedOn), updaterText: d.updaterText,
    informationText: d.informationText, fillingNote: d.fillingNote, sourceDocument: d.sourceDocument, divisionNote: d.divisionNote,
  };
  const id = await prisma.$transaction(async (tx) => {
    if (meetingId) {
      const cur = await tx.meetingBatch.findUnique({ where: { id: meetingId } });
      if (!cur || cur.customerId !== customerId) throw new Error("会谈不存在");
      await tx.meetingBatch.update({ where: { id: meetingId }, data });
      await tx.meetingAttendee.deleteMany({ where: { batchId: meetingId } });
      await tx.meetingAttendee.createMany({ data: attendees(fd).map((a) => ({ ...a, batchId: meetingId })) });
      await writeAudit(tx, { entityType: "meeting", entityId: meetingId, action: "update", actorId: user.id, summary: `修改会谈 ${title}` });
      return meetingId;
    }
    const m = await tx.meetingBatch.create({ data: { ...data, customerId, attendees: { create: attendees(fd) } } });
    await writeAudit(tx, { entityType: "meeting", entityId: m.id, action: "create", actorId: user.id, summary: `新建会谈 ${title}` });
    return m.id;
  });
  revalidatePath(`/customers/${customerId}`);
  redirect(`/meetings/${id}`);
}
