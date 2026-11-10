import { describe, expect, it } from "vitest";
import { evaluateReminders, type IssueSnapshot } from "@/lib/reminder-rules";

const s = { dueSoonDays: 3, pendingDays: 7, highNoDueGraceDays: 1 };
const today = "2026-11-10";
const base: IssueSnapshot = {
  status: "in_progress",
  priorityKey: "medium",
  dueOn: null,
  assigneeIds: ["u1"],
  statusChangedAt: new Date("2026-11-09T02:00:00Z"),
  createdAt: new Date("2026-11-09T02:00:00Z"),
  updatedById: "u2",
};
const types = (i: IssueSnapshot) => evaluateReminders(i, s, today, ["admin"]).map((h) => h.type);

describe("提醒规则", () => {
  it("已完成/已关闭不提醒", () => {
    expect(types({ ...base, status: "done", dueOn: "2026-01-01" })).toEqual([]);
    expect(types({ ...base, status: "closed", priorityKey: "high", assigneeIds: [] })).toEqual([]);
  });

  it("临期：今日起 3 日内（含当日）", () => {
    expect(types({ ...base, dueOn: "2026-11-10" })).toEqual(["due_soon"]);
    expect(types({ ...base, dueOn: "2026-11-12" })).toEqual(["due_soon"]);
    expect(types({ ...base, dueOn: "2026-11-13" })).toEqual([]);
  });

  it("逾期；无担当通知管理员", () => {
    const hits = evaluateReminders({ ...base, dueOn: "2026-11-09", assigneeIds: [] }, s, today, ["admin"]);
    expect(hits[0]).toMatchObject({ type: "overdue", recipients: ["admin"] });
  });

  it("长期待客户确认超过 7 天", () => {
    const old = new Date("2026-11-01T02:00:00Z");
    expect(types({ ...base, status: "pending_customer", statusChangedAt: old })).toEqual(["pending_customer_long"]);
    expect(types({ ...base, status: "pending_customer", statusChangedAt: new Date("2026-11-03T02:00:00Z") })).toEqual([]);
  });

  it("高优先缺担当、缺期限（创建超过宽限）", () => {
    expect(types({ ...base, priorityKey: "high", assigneeIds: [] })).toEqual(["high_no_assignee", "high_no_due"]);
    expect(types({ ...base, priorityKey: "high", createdAt: new Date("2026-11-10T01:00:00Z") })).toEqual([]);
  });
});
