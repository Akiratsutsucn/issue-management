// 操作日志与课题时间线：只增。本模块不导出任何更新或删除函数。
import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";

export interface AuditInput {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  summary: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  isException?: boolean;
}

export async function writeAudit(tx: Tx, a: AuditInput): Promise<void> {
  await tx.auditLog.create({ data: { ...a } });
}

export async function writeActivity(
  tx: Tx,
  issueId: string,
  actorId: string | null,
  action: string,
  summary: string,
  detail?: Prisma.InputJsonValue,
): Promise<void> {
  await tx.activity.create({ data: { issueId, actorId, action, summary, detail } });
}

/** 课题级事件：同时写时间线与全局日志 */
export async function recordIssueEvent(
  tx: Tx,
  issueId: string,
  actorId: string | null,
  action: string,
  summary: string,
  opts: { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue; isException?: boolean } = {},
): Promise<void> {
  await writeActivity(tx, issueId, actorId, action, summary, opts.after ? { before: opts.before ?? null, after: opts.after } : undefined);
  await writeAudit(tx, { entityType: "issue", entityId: issueId, action, actorId, summary, ...opts });
}
