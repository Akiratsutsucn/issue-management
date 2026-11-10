// 状态流转、客户确认、追加进展、关联、证据
import { dateToYmd, todayShanghai, ymdToDate } from "../dates";
import { ENTRY_LABEL, EVIDENCE_LABEL } from "../labels";
import { sanitizeRich } from "../sanitize";
import { STATUS_LABEL, checkTransition, type IssueStatus } from "../status";
import { recordIssueEvent } from "./audit";
import type { SessionUser } from "./auth";
import { prisma } from "./db";
import { UserError } from "./issues";
import { refreshRemindersSafely } from "./reminders";

export type StatusResult = { ok: true } | { ok: false; error: string; missing?: string[] };

export async function changeStatus(
  issueId: string,
  to: IssueStatus,
  reason: string,
  exceptional: boolean,
  user: SessionUser,
): Promise<StatusResult> {
  const result = await prisma.$transaction(async (tx): Promise<StatusResult> => {
    const cur = await tx.issue.findUnique({ where: { id: issueId } });
    if (!cur) return { ok: false, error: "课题不存在" };
    const visibleEvidenceCount = await tx.evidence.count({ where: { issueId, hiddenAt: null } });
    const check = checkTransition({
      from: cur.status,
      to,
      reason,
      exceptional,
      isAdmin: user.role === "admin",
      gate: {
        visibleEvidenceCount,
        confirmName: cur.completionConfirmName,
        confirmedAt: cur.completionConfirmedAt ? dateToYmd(cur.completionConfirmedAt) : null,
      },
    });
    if (!check.ok) return check;

    const today = ymdToDate(todayShanghai());
    const data: Record<string, unknown> = { status: to, statusChangedAt: new Date(), updatedById: user.id };
    if (to === "answered" && !cur.firstAnsweredAt) data.firstAnsweredAt = today;
    if (to === "done") {
      data.completedAt = today;
      data.exceptionalCompletion = check.exceptional;
      data.exceptionalReason = check.exceptional ? reason.trim() : "";
    }
    if (cur.status === "done" && to !== "done") {
      // 重开：完成标记失效，历史在日志中保留
      data.completedAt = null;
      data.exceptionalCompletion = false;
      data.exceptionalReason = "";
      data.completionConfirmName = "";
      data.completionConfirmContactId = null;
      data.completionConfirmedAt = null;
      data.completionConfirmMethod = "";
      data.completionConfirmNote = "";
      data.completionConfirmedByUserId = null;
    }
    await tx.issue.update({ where: { id: issueId }, data });
    const label = `${STATUS_LABEL[cur.status]} → ${STATUS_LABEL[to]}`;
    const summary = check.exceptional ? `例外完成：${label}（理由：${reason.trim()}）` : reason.trim() ? `${label}（理由：${reason.trim()}）` : label;
    await recordIssueEvent(tx, issueId, user.id, check.exceptional ? "exceptional_done" : "status", summary, {
      before: { status: cur.status },
      after: { status: to, reason: reason.trim() },
      isException: check.exceptional,
    });
    return { ok: true };
  });
  if (result.ok) refreshRemindersSafely(issueId);
  return result;
}

export interface ConfirmInput {
  name: string;
  contactId: string | null;
  confirmedOn: string;
  method: string;
  note: string;
}

export async function recordConfirmation(issueId: string, c: ConfirmInput, user: SessionUser): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const cur = await tx.issue.findUnique({ where: { id: issueId } });
    if (!cur) throw new UserError("课题不存在");
    let name = c.name.trim();
    if (c.contactId) {
      const contact = await tx.contact.findUnique({ where: { id: c.contactId } });
      if (!contact || contact.customerId !== cur.customerId) throw new UserError("确认人不属于该客户");
      name ||= contact.name;
    }
    if (!name) throw new UserError("请填写客户确认人");
    if (!c.confirmedOn) throw new UserError("请填写确认时间");
    await tx.issue.update({
      where: { id: issueId },
      data: {
        completionConfirmName: name,
        completionConfirmContactId: c.contactId,
        completionConfirmedAt: ymdToDate(c.confirmedOn),
        completionConfirmMethod: c.method.trim(),
        completionConfirmNote: c.note.trim(),
        completionConfirmedByUserId: user.id,
        updatedById: user.id,
      },
    });
    await recordIssueEvent(tx, issueId, user.id, "confirm", `记录客户确认：${name}（${c.confirmedOn}${c.method ? "，" + c.method : ""}）`);
  });
}

export async function setMilestoneDates(issueId: string, firstAnswered: string, completed: string, user: SessionUser): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const cur = await tx.issue.findUnique({ where: { id: issueId } });
    if (!cur) throw new UserError("课题不存在");
    await tx.issue.update({
      where: { id: issueId },
      data: { firstAnsweredAt: ymdToDate(firstAnswered), completedAt: ymdToDate(completed), updatedById: user.id },
    });
    await recordIssueEvent(tx, issueId, user.id, "update", "修改首次回答日/完成日", {
      before: { firstAnsweredAt: dateToYmd(cur.firstAnsweredAt), completedAt: dateToYmd(cur.completedAt) },
      after: { firstAnsweredAt: firstAnswered, completedAt: completed },
    });
  });
}

export async function addEntry(
  issueId: string,
  kind: "problem" | "solution",
  body: string,
  reopenIfAnswered: boolean,
  user: SessionUser,
): Promise<{ reopened: boolean }> {
  const clean = sanitizeRich(body);
  if (!clean) throw new UserError("内容为空");
  const res = await prisma.$transaction(async (tx) => {
    const cur = await tx.issue.findUnique({ where: { id: issueId } });
    if (!cur) throw new UserError("课题不存在");
    await tx.issueEntry.create({ data: { issueId, kind, body: clean, authorId: user.id } });
    await tx.issue.update({ where: { id: issueId }, data: { updatedById: user.id } });
    await recordIssueEvent(tx, issueId, user.id, "entry", `追加${ENTRY_LABEL[kind]}`);
    if (kind === "problem" && reopenIfAnswered && cur.status === "answered") {
      await tx.issue.update({ where: { id: issueId }, data: { status: "in_progress", statusChangedAt: new Date() } });
      await recordIssueEvent(tx, issueId, user.id, "status", "已回答 → 处理中（追加问题）", {
        before: { status: "answered" },
        after: { status: "in_progress" },
      });
      return { reopened: true };
    }
    return { reopened: false };
  });
  refreshRemindersSafely(issueId);
  return res;
}

const WITHDRAW_WINDOW_MS = 5 * 60_000;

/** 管理员可在 5 分钟内撤回自己刚提交的一条 */
export async function withdrawEntry(entryId: string, user: SessionUser): Promise<void> {
  if (user.role !== "admin") throw new UserError("仅管理员可撤回");
  await prisma.$transaction(async (tx) => {
    const e = await tx.issueEntry.findUnique({ where: { id: entryId } });
    if (!e || e.withdrawnAt) throw new UserError("记录不存在或已撤回");
    if (e.authorId !== user.id) throw new UserError("只能撤回自己提交的记录");
    if (Date.now() - e.createdAt.getTime() > WITHDRAW_WINDOW_MS) throw new UserError("已超过 5 分钟，不能撤回，请追加更正说明");
    await tx.issueEntry.update({ where: { id: entryId }, data: { withdrawnAt: new Date(), withdrawnById: user.id } });
    await recordIssueEvent(tx, e.issueId, user.id, "entry_withdraw", `撤回一条${ENTRY_LABEL[e.kind]}`);
  });
}

export async function linkIssues(fromId: string, toProjectId: string, toSeq: number, note: string, user: SessionUser): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const from = await tx.issue.findUnique({ where: { id: fromId } });
    const to = await tx.issue.findUnique({ where: { serviceProjectId_customerSeq: { serviceProjectId: toProjectId, customerSeq: toSeq } } });
    if (!from || !to) throw new UserError("目标课题不存在");
    if (from.id === to.id) throw new UserError("不能关联自身");
    const dup = await tx.issueLink.findFirst({
      where: { OR: [{ fromIssueId: from.id, toIssueId: to.id }, { fromIssueId: to.id, toIssueId: from.id }] },
    });
    if (dup) throw new UserError("已关联");
    await tx.issueLink.create({ data: { fromIssueId: from.id, toIssueId: to.id, note: note.trim() } });
    await recordIssueEvent(tx, from.id, user.id, "link", `关联课题 #${to.customerSeq}`);
    await recordIssueEvent(tx, to.id, user.id, "link", `被课题 #${from.customerSeq} 关联`);
  });
}

export async function unlinkIssues(linkId: string, user: SessionUser): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const l = await tx.issueLink.findUnique({ where: { id: linkId }, include: { fromIssue: true, toIssue: true } });
    if (!l) throw new UserError("关联不存在");
    await tx.issueLink.delete({ where: { id: linkId } });
    await recordIssueEvent(tx, l.fromIssueId, user.id, "unlink", `取消关联 #${l.toIssue.customerSeq}`);
    await recordIssueEvent(tx, l.toIssueId, user.id, "unlink", `取消关联 #${l.fromIssue.customerSeq}`);
  });
}

export async function hideEvidence(evidenceId: string, reason: string, user: SessionUser): Promise<void> {
  if (!reason.trim()) throw new UserError("隐藏证据须填写理由");
  await prisma.$transaction(async (tx) => {
    const ev = await tx.evidence.findUnique({ where: { id: evidenceId } });
    if (!ev || ev.hiddenAt) throw new UserError("证据不存在或已隐藏");
    await tx.evidence.update({ where: { id: evidenceId }, data: { hiddenAt: new Date(), hiddenById: user.id, hiddenReason: reason.trim() } });
    await recordIssueEvent(tx, ev.issueId, user.id, "evidence_hide", `隐藏证据「${ev.fileName}」（理由：${reason.trim()}）`);
  });
}

export async function evidenceUploaded(issueId: string, fileName: string, type: keyof typeof EVIDENCE_LABEL, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.issue.update({ where: { id: issueId }, data: { updatedById: userId } });
    await recordIssueEvent(tx, issueId, userId, "evidence_upload", `上传证据「${fileName}」（${EVIDENCE_LABEL[type]}）`);
  });
}
