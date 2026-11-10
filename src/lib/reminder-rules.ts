// 提醒规则（纯函数）：给定课题快照，返回应产生的提醒
import { addDays, diffDays, shanghaiYmd } from "./dates";
import type { IssueStatus } from "./status";

export type ReminderType = "due_soon" | "overdue" | "pending_customer_long" | "high_no_assignee" | "high_no_due";

export const REMINDER_LABEL: Record<ReminderType, string> = {
  due_soon: "临近期限",
  overdue: "已逾期",
  pending_customer_long: "长期待客户确认",
  high_no_assignee: "高优先缺担当",
  high_no_due: "高优先缺期限",
};

export interface IssueSnapshot {
  status: IssueStatus;
  priorityKey: string;
  dueOn: string | null;
  assigneeIds: string[];
  statusChangedAt: Date;
  createdAt: Date;
  updatedById: string;
}

export interface ReminderSettings {
  dueSoonDays: number;
  pendingDays: number;
  highNoDueGraceDays: number;
}

export interface ReminderHit {
  type: ReminderType;
  reason: string;
  recipients: string[];
}

const OPEN: IssueStatus[] = ["open", "in_progress", "answered", "pending_customer"];

export function evaluateReminders(issue: IssueSnapshot, s: ReminderSettings, today: string, adminIds: string[]): ReminderHit[] {
  if (!OPEN.includes(issue.status)) return [];
  const hits: ReminderHit[] = [];
  const ownerOrAdmin = issue.assigneeIds.length ? issue.assigneeIds : adminIds;

  if (issue.dueOn) {
    if (issue.dueOn < today) {
      hits.push({ type: "overdue", reason: `期限 ${issue.dueOn} 已过 ${diffDays(issue.dueOn, today)} 天`, recipients: ownerOrAdmin });
    } else if (issue.dueOn <= addDays(today, s.dueSoonDays - 1)) {
      const d = diffDays(today, issue.dueOn);
      hits.push({ type: "due_soon", reason: d === 0 ? `今日到期` : `${d} 天后到期（${issue.dueOn}）`, recipients: ownerOrAdmin });
    }
  }

  if (issue.status === "pending_customer") {
    const days = diffDays(shanghaiYmd(issue.statusChangedAt), today);
    if (days > s.pendingDays) {
      hits.push({
        type: "pending_customer_long",
        reason: `待客户确认已 ${days} 天`,
        recipients: unique([...issue.assigneeIds, issue.updatedById]),
      });
    }
  }

  if (issue.priorityKey === "high") {
    const adminsAndEditor = unique([...adminIds, issue.updatedById]);
    if (issue.assigneeIds.length === 0) {
      hits.push({ type: "high_no_assignee", reason: "高优先，未指定具体担当", recipients: adminsAndEditor });
    }
    if (!issue.dueOn && diffDays(shanghaiYmd(issue.createdAt), today) >= s.highNoDueGraceDays) {
      hits.push({ type: "high_no_due", reason: "高优先，期限仍为空", recipients: adminsAndEditor });
    }
  }
  return hits.map((h) => ({ ...h, recipients: unique(h.recipients) })).filter((h) => h.recipients.length > 0);
}

function unique(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}
