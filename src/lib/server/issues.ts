// 课题创建与标量编辑
import { Prisma } from "@prisma/client";
import { dateToYmd, todayShanghai, ymdToDate } from "../dates";
import { richToText, sanitizeRich } from "../sanitize";
import { splitList, type IssueCreateInput, type IssueFieldsInput } from "../validation";
import { recordIssueEvent, writeAudit } from "./audit";
import { prisma, type Tx } from "./db";
import type { SessionUser } from "./auth";
import { refreshRemindersSafely } from "./reminders";

export class UserError extends Error {}

async function nextSeq(tx: Tx, customerId: string): Promise<number> {
  const agg = await tx.issue.aggregate({ where: { customerId }, _max: { customerSeq: true } });
  return (agg._max.customerSeq ?? 0) + 1;
}

export async function setTags(tx: Tx, issueId: string, raw: string): Promise<string[]> {
  const names = splitList(raw).slice(0, 20);
  await tx.issueTagOnIssue.deleteMany({ where: { issueId } });
  for (const name of names) {
    const tag = await tx.issueTag.upsert({ where: { nameLc: name.toLowerCase() }, update: {}, create: { name, nameLc: name.toLowerCase() } });
    await tx.issueTagOnIssue.create({ data: { issueId, tagId: tag.id } });
  }
  return names;
}

async function checkRefs(tx: Tx, customerId: string, f: IssueFieldsInput): Promise<void> {
  if (f.meetingBatchId) {
    const m = await tx.meetingBatch.findUnique({ where: { id: f.meetingBatchId } });
    if (!m || m.customerId !== customerId) throw new UserError("会谈不属于该客户");
  }
  if (f.reporterContactId) {
    const c = await tx.contact.findUnique({ where: { id: f.reporterContactId } });
    if (!c || c.customerId !== customerId) throw new UserError("起票者不属于该客户");
  }
  const pr = await tx.priority.findUnique({ where: { id: f.priorityId } });
  if (!pr) throw new UserError("优先级无效");
  if (f.assigneeIds.length) {
    const n = await tx.user.count({ where: { id: { in: f.assigneeIds }, isActive: true } });
    if (n !== new Set(f.assigneeIds).size) throw new UserError("担当中有无效用户");
  }
}

function scalarData(f: IssueFieldsInput) {
  return {
    meetingBatchId: f.meetingBatchId,
    sourceId: f.sourceId,
    issueTypeId: f.issueTypeId,
    title: f.title,
    titleIsDraft: f.title === "",
    priorityId: f.priorityId,
    confirmationKind: f.confirmationKind,
    recordedOn: ymdToDate(f.recordedOn),
    dueOn: ymdToDate(f.dueOn),
    waitingOn: f.waitingOn,
    nextAction: f.nextAction,
    reporterContactId: f.reporterContactId,
    reporterText: f.reporterText,
    teamAssigned: f.teamAssigned,
    assigneeText: f.assigneeText,
    completionCondition: sanitizeRich(f.completionCondition),
    internalNote: sanitizeRich(f.internalNote),
  };
}

async function resolveCustomer(tx: Tx, input: IssueCreateInput, user: SessionUser): Promise<string> {
  if (input.customerId) {
    const c = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!c) throw new UserError("客户不存在");
    return c.id;
  }
  const name = input.newCustomerName.trim();
  if (!name) throw new UserError("请选择或新建客户");
  const settings = await tx.teamSettings.findUnique({ where: { id: 1 } });
  if (user.role !== "admin" && settings && !settings.memberCanCreateCustomer) throw new UserError("当前设置不允许成员新建客户");
  const exists = await tx.customer.findUnique({ where: { name } });
  if (exists) return exists.id;
  const c = await tx.customer.create({ data: { name } });
  await writeAudit(tx, { entityType: "customer", entityId: c.id, action: "create", actorId: user.id, summary: `新建客户 ${name}` });
  return c.id;
}

export async function createIssue(input: IssueCreateInput, user: SessionUser): Promise<{ id: string; customerId: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const customerId = await resolveCustomer(tx, input, user);
        await checkRefs(tx, customerId, input);
        const seq = await nextSeq(tx, customerId);
        const data = scalarData(input);
        const issue = await tx.issue.create({
          data: {
            ...data,
            customerId,
            customerSeq: seq,
            recordedOn: data.recordedOn ?? ymdToDate(todayShanghai()),
            createdById: user.id,
            updatedById: user.id,
            assignees: { create: [...new Set(input.assigneeIds)].map((userId) => ({ userId })) },
          },
        });
        await setTags(tx, issue.id, input.tags);
        for (const [kind, body] of [["problem", input.problem], ["solution", input.solution]] as const) {
          const clean = sanitizeRich(body);
          if (clean) await tx.issueEntry.create({ data: { issueId: issue.id, kind, body: clean, authorId: user.id } });
        }
        await recordIssueEvent(tx, issue.id, user.id, "create", `创建课题 #${seq}`, { after: { title: issue.title, status: issue.status } });
        return { id: issue.id, customerId };
      });
      refreshRemindersSafely(result.id);
      return result;
    } catch (e) {
      // 并发取号冲突时重试
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
      throw e;
    }
  }
  throw new UserError("番号分配冲突，请重试");
}

const DIFF_LABEL: Record<string, string> = {
  title: "标题",
  priorityId: "优先级",
  confirmationKind: "确认类别",
  recordedOn: "记载日",
  dueOn: "期限",
  waitingOn: "待谁处理",
  nextAction: "下一步",
  reporterContactId: "起票者",
  reporterText: "起票者原文",
  teamAssigned: "团队承接",
  assigneeText: "担当原文",
  completionCondition: "完了条件",
  internalNote: "内部备注",
  meetingBatchId: "会谈",
  sourceId: "来源",
  issueTypeId: "类型",
  assignees: "担当",
  tags: "标签",
};

function show(v: unknown): string {
  if (v instanceof Date) return dateToYmd(v);
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "是" : "否";
  const s = String(v);
  return s.startsWith("<") ? richToText(s).slice(0, 80) || "[图片]" : s.slice(0, 80);
}

export async function updateIssue(issueId: string, f: IssueFieldsInput, user: SessionUser): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const cur = await tx.issue.findUnique({ where: { id: issueId }, include: { assignees: true, tags: { include: { tag: true } } } });
    if (!cur) throw new UserError("课题不存在");
    await checkRefs(tx, cur.customerId, f);
    const data = scalarData(f);
    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === "titleIsDraft") continue;
      const old = (cur as Record<string, unknown>)[k];
      if (show(old) !== show(v) || (typeof old === "string" && typeof v === "string" && old !== v)) {
        before[k] = show(old);
        after[k] = show(v);
      }
    }
    const oldAssignees = cur.assignees.map((a) => a.userId).sort();
    const newAssignees = [...new Set(f.assigneeIds)].sort();
    if (oldAssignees.join() !== newAssignees.join()) {
      const users = await tx.user.findMany({ where: { id: { in: [...oldAssignees, ...newAssignees] } } });
      const nm = (ids: string[]) => ids.map((id) => users.find((u) => u.id === id)?.displayName ?? "?").join("、") || "—";
      before.assignees = nm(oldAssignees);
      after.assignees = nm(newAssignees);
      await tx.issueAssignee.deleteMany({ where: { issueId } });
      await tx.issueAssignee.createMany({ data: newAssignees.map((userId) => ({ issueId, userId })) });
    }
    const oldTags = cur.tags.map((t) => t.tag.name).join("、");
    const newTags = (await setTags(tx, issueId, f.tags)).join("、");
    if (oldTags !== newTags) {
      before.tags = oldTags || "—";
      after.tags = newTags || "—";
    }
    await tx.issue.update({ where: { id: issueId }, data: { ...data, updatedById: user.id } });
    const keys = Object.keys(after);
    if (keys.length) {
      const summary = `修改 ${keys.map((k) => DIFF_LABEL[k] ?? k).join("、")}`;
      await recordIssueEvent(tx, issueId, user.id, "update", summary, { before, after });
    }
  });
  refreshRemindersSafely(issueId);
}
