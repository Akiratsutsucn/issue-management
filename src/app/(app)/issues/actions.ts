"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { firstError, issueCreateSchema, issueFieldsSchema, STATUSES } from "@/lib/validation";
import type { IssueStatus } from "@/lib/status";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { addAssignee, createIssue, updateIssue, UserError } from "@/lib/server/issues";
import {
  addEntry,
  changeStatus,
  hideEvidence,
  linkIssues,
  recordConfirmation,
  setMilestoneDates,
  unlinkIssues,
  withdrawEntry,
} from "@/lib/server/issue-ops";
import { isYmd } from "@/lib/dates";

export type FormState = { error: string; missing?: string[]; ok?: string };

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

function issueFields(fd: FormData) {
  return {
    meetingBatchId: s(fd, "meetingBatchId"),
    sourceId: s(fd, "sourceId"),
    issueTypeId: s(fd, "issueTypeId"),
    title: s(fd, "title"),
    priorityId: s(fd, "priorityId"),
    confirmationKind: s(fd, "confirmationKind"),
    recordedOn: s(fd, "recordedOn"),
    dueOn: s(fd, "dueOn"),
    waitingOn: s(fd, "waitingOn"),
    nextAction: s(fd, "nextAction"),
    reporterContactId: s(fd, "reporterContactId"),
    reporterText: s(fd, "reporterText"),
    assigneeIds: fd.getAll("assigneeIds").map(String).filter(Boolean),
    teamAssigned: fd.get("teamAssigned") === "on",
    assigneeText: s(fd, "assigneeText"),
    completionCondition: s(fd, "completionCondition"),
    internalNote: s(fd, "internalNote"),
    tags: s(fd, "tags"),
  };
}

function errorOf(e: unknown): FormState {
  if (e instanceof UserError) return { error: e.message };
  console.error("[issues] action failed:", e instanceof Error ? e.message : e);
  return { error: "保存失败，请稍后重试" };
}

export async function createIssueAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = issueCreateSchema.safeParse({
    ...issueFields(fd),
    customerId: s(fd, "customerId"),
    newCustomerName: s(fd, "newCustomerName"),
    serviceProjectId: s(fd, "serviceProjectId"),
    newProjectName: s(fd, "newProjectName"),
    problem: s(fd, "problem"),
    solution: s(fd, "solution"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  let res: { id: string; customerId: string; serviceProjectId: string };
  try {
    res = await createIssue(parsed.data, user);
  } catch (e) {
    return errorOf(e);
  }
  revalidatePath("/", "layout");
  if (fd.get("next") === "another") {
    const q = new URLSearchParams({ customer: res.customerId, project: res.serviceProjectId, created: "1" });
    if (parsed.data.meetingBatchId) q.set("batch", parsed.data.meetingBatchId);
    redirect(`/issues/new?${q}`);
  }
  redirect(`/issues/${res.id}`);
}

export async function updateIssueAction(issueId: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = issueFieldsSchema.safeParse(issueFields(fd));
  if (!parsed.success) return { error: firstError(parsed.error) };
  try {
    await updateIssue(issueId, parsed.data, user);
  } catch (e) {
    return errorOf(e);
  }
  revalidatePath("/", "layout");
  redirect(`/issues/${issueId}`);
}

export async function changeStatusAction(issueId: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const to = s(fd, "to");
  if (!(STATUSES as readonly string[]).includes(to)) return { error: "状态无效" };
  try {
    const r = await changeStatus(issueId, to as IssueStatus, s(fd, "reason").slice(0, 1000), fd.get("exceptional") === "on", user);
    if (!r.ok) return { error: r.error, missing: r.missing };
  } catch (e) {
    return errorOf(e);
  }
  revalidatePath(`/issues/${issueId}`);
  return { error: "", ok: "状态已更新" };
}

export async function confirmAction(issueId: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const confirmedOn = s(fd, "confirmedOn");
  if (confirmedOn && !isYmd(confirmedOn)) return { error: "确认日期格式无效" };
  try {
    await recordConfirmation(
      issueId,
      {
        name: s(fd, "name").slice(0, 80),
        contactId: s(fd, "contactId") || null,
        confirmedOn,
        method: s(fd, "method").slice(0, 80),
        note: s(fd, "note").slice(0, 1000),
      },
      user,
    );
  } catch (e) {
    return errorOf(e);
  }
  revalidatePath(`/issues/${issueId}`);
  return { error: "", ok: "已记录客户确认" };
}

export async function milestoneAction(issueId: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const fa = s(fd, "firstAnsweredAt");
  const ca = s(fd, "completedAt");
  if ((fa && !isYmd(fa)) || (ca && !isYmd(ca))) return { error: "日期格式无效" };
  try {
    await setMilestoneDates(issueId, fa, ca, user);
  } catch (e) {
    return errorOf(e);
  }
  revalidatePath(`/issues/${issueId}`);
  return { error: "", ok: "已保存" };
}

export async function addEntryAction(issueId: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const kind = s(fd, "kind") === "solution" ? "solution" : "problem";
  try {
    const r = await addEntry(issueId, kind, s(fd, "body"), fd.get("reopen") === "on", user);
    revalidatePath(`/issues/${issueId}`);
    return { error: "", ok: r.reopened ? "已追加，状态改回处理中" : "已追加" };
  } catch (e) {
    return errorOf(e);
  }
}

export async function withdrawEntryAction(issueId: string, entryId: string): Promise<void> {
  const user = await requireUser();
  try {
    await withdrawEntry(entryId, user);
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
  }
  revalidatePath(`/issues/${issueId}`);
}

export async function linkAction(issueId: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const seq = Number(s(fd, "seq").replace(/^#/, ""));
  if (!Number.isInteger(seq) || seq < 1) return { error: "请填写番号" };
  try {
    await linkIssues(issueId, s(fd, "serviceProjectId"), seq, s(fd, "note").slice(0, 300), user);
  } catch (e) {
    return errorOf(e);
  }
  revalidatePath(`/issues/${issueId}`);
  return { error: "", ok: "已关联" };
}

export async function unlinkAction(issueId: string, linkId: string): Promise<void> {
  const user = await requireUser();
  await unlinkIssues(linkId, user);
  revalidatePath(`/issues/${issueId}`);
}

export async function hideEvidenceAction(issueId: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await hideEvidence(s(fd, "evidenceId"), s(fd, "reason").slice(0, 500), user);
  } catch (e) {
    return errorOf(e);
  }
  revalidatePath(`/issues/${issueId}`);
  return { error: "", ok: "已隐藏" };
}

/** 批量：改状态（逐条走状态机，不能批量完成）或追加担当 */
export async function bulkAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const ids = fd.getAll("ids").map(String).filter(Boolean).slice(0, 200);
  if (!ids.length) return { error: "未选择课题" };
  const op = s(fd, "op");
  let ok = 0;
  const failed: string[] = [];
  if (op === "status") {
    const to = s(fd, "to");
    if (!(STATUSES as readonly string[]).includes(to) || to === "done") return { error: "批量不能改为已完成，请逐条确认证据" };
    const reason = s(fd, "reason").slice(0, 500);
    for (const id of ids) {
      const r = await changeStatus(id, to as IssueStatus, reason, false, user);
      if (r.ok) ok++;
      else failed.push(r.error);
    }
  } else if (op === "assignee") {
    const uid = s(fd, "userId");
    const target = await prisma.user.findFirst({ where: { id: uid, isActive: true } });
    if (!target) return { error: "请选择担当" };
    for (const id of ids) {
      try {
        await addAssignee(id, target.id, target.displayName, user);
        ok++;
      } catch (e) {
        failed.push(e instanceof UserError ? e.message : "保存失败");
      }
    }
  } else {
    return { error: "操作无效" };
  }
  revalidatePath("/", "layout");
  return failed.length ? { error: `成功 ${ok} 条，失败 ${failed.length} 条：${[...new Set(failed)].join("；")}` } : { error: "", ok: `已处理 ${ok} 条` };
}

export async function saveColumnsAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  // 勾选的列按用户填写的序号排序
  const cols = fd
    .getAll("cols")
    .map(String)
    .slice(0, 40)
    .map((k, i) => ({ k, o: Number(fd.get(`order_${k}`)) || 100 + i }))
    .sort((a, b) => a.o - b.o)
    .map((x) => x.k);
  await prisma.user.update({ where: { id: user.id }, data: { listColumns: cols } });
  revalidatePath("/issues");
  redirect("/issues");
}
