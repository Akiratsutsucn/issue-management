import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/db", () => ({ prisma: {} }));

const { median } = await import("@/lib/server/stats");
const { buildIssueWhere, buildIssueOrder, param } = await import("@/lib/server/issue-query");

describe("统计与筛选", () => {
  it("中位数", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it("默认只看未完结", () => {
    const w = buildIssueWhere({}) as { AND: unknown[] };
    expect(w.AND[0]).toEqual({ status: { in: ["open", "in_progress", "answered", "pending_customer"] } });
  });

  it("status=all 不加状态条件；非法状态回退未完结", () => {
    expect(buildIssueWhere({ status: "all" })).toEqual({});
    const w = buildIssueWhere({ status: "bogus" }) as { AND: { status: { in: string[] } }[] };
    expect(w.AND[0].status.in).toContain("open");
  });

  it("逾期、无担当、关键词按番号", () => {
    const w = JSON.stringify(buildIssueWhere({ overdue: "1", assignee: "none", q: "#12" }));
    expect(w).toContain('"lt"');
    expect(w).toContain('"none":{}');
    expect(w).toContain('"customerSeq":12');
  });

  it("排序与参数", () => {
    expect(buildIssueOrder({ sort: "dueOn", dir: "asc" })).toEqual([{ dueOn: { sort: "asc", nulls: "last" } }]);
    expect(buildIssueOrder({})).toEqual([{ updatedAt: "desc" }]);
    expect(param({ a: ["x", "y"] }, "a")).toBe("x");
  });
});
