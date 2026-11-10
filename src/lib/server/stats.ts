// 概览统计。数字块直接复用列表筛选条件，保证与列表一致。
import { addDays, dateToYmd, diffDays, shanghaiYmd, todayShanghai } from "../dates";
import { UNFINISHED } from "../status";
import { prisma } from "./db";
import { buildIssueWhere, type SearchParams } from "./issue-query";

const count = (sp: SearchParams) => prisma.issue.count({ where: buildIssueWhere(sp) });

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function overviewStats(pendingDays: number, highNoDueGraceDays: number) {
  // 与提醒同口径：创建日距今满宽限天数才计入缺期限
  const createdTo = addDays(todayShanghai(), -highNoDueGraceDays);
  const high = await prisma.priority.findUnique({ where: { key: "high" } });
  const highId = high?.id ?? "__none__";
  const unfinishedWhere = { status: { in: UNFINISHED } };

  const [total, unfinished, overdue, dueSoon, pendingLong, highNoAssignee, highNoDue] = await Promise.all([
    prisma.issue.count(),
    count({}),
    count({ overdue: "1" }),
    count({ dueSoon: "1" }),
    count({ pendingLong: String(pendingDays) }),
    count({ priority: highId, assignee: "none" }),
    count({ priority: highId, noDue: "1", createdTo }),
  ]);

  const [byStatus, byPriority, byWaiting, byCustomer, byAssignee, unassigned] = await Promise.all([
    prisma.issue.groupBy({ by: ["status"], _count: true }),
    prisma.issue.groupBy({ by: ["priorityId"], where: unfinishedWhere, _count: true }),
    prisma.issue.groupBy({ by: ["waitingOn"], where: unfinishedWhere, _count: true }),
    prisma.issue.groupBy({ by: ["customerId"], where: unfinishedWhere, _count: true, orderBy: { _count: { customerId: "desc" } }, take: 8 }),
    prisma.issueAssignee.groupBy({ by: ["userId"], where: { issue: unfinishedWhere }, _count: true }),
    prisma.issue.count({ where: { ...unfinishedWhere, assignees: { none: {} } } }),
  ]);

  const [customers, users, priorities, answered] = await Promise.all([
    prisma.customer.findMany({ where: { id: { in: byCustomer.map((c) => c.customerId) } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: byAssignee.map((a) => a.userId) } }, select: { id: true, displayName: true } }),
    prisma.priority.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.issue.findMany({ where: { firstAnsweredAt: { not: null } }, select: { firstAnsweredAt: true, recordedOn: true, createdAt: true } }),
  ]);

  const responseDays = answered
    .map((i) => diffDays(i.recordedOn ? dateToYmd(i.recordedOn) : shanghaiYmd(i.createdAt), dateToYmd(i.firstAnsweredAt)))
    .filter((d) => d >= 0);
  const avg = responseDays.length ? responseDays.reduce((a, b) => a + b, 0) / responseDays.length : null;

  return {
    total,
    unfinished,
    overdue,
    dueSoon,
    pendingLong,
    highNoAssignee,
    highNoDue,
    highId,
    createdTo,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    byPriority: priorities.map((p) => ({ id: p.id, label: p.label, color: p.color, n: byPriority.find((b) => b.priorityId === p.id)?._count ?? 0 })),
    byWaiting: Object.fromEntries(byWaiting.map((w) => [w.waitingOn, w._count])),
    byCustomer: byCustomer.map((c) => ({ id: c.customerId, name: customers.find((x) => x.id === c.customerId)?.name ?? "?", n: c._count })),
    byAssignee: [
      ...byAssignee
        .map((a) => ({ id: a.userId, name: users.find((u) => u.id === a.userId)?.displayName ?? "?", n: a._count }))
        .sort((a, b) => b.n - a.n),
      ...(unassigned ? [{ id: "none", name: "未指定", n: unassigned }] : []),
    ],
    response: {
      samples: responseDays.length,
      median: responseDays.length >= 3 ? median(responseDays) : null,
      avg: responseDays.length >= 3 ? avg : null,
    },
  };
}
