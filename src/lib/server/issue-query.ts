// 课题列表筛选：URL 参数 → Prisma where/orderBy
import type { Prisma } from "@prisma/client";
import { addDays, isYmd, todayShanghai, ymdToDate } from "../dates";
import { CONFIRM_KIND, STATUSES, WAITING } from "../validation";
import { UNFINISHED, type IssueStatus } from "../status";
import { prisma } from "./db";

export type SearchParams = Record<string, string | string[] | undefined>;

export function param(sp: SearchParams, k: string): string {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function list(sp: SearchParams, k: string): string[] {
  return param(sp, k).split(",").map((s) => s.trim()).filter(Boolean);
}

function dateParam(sp: SearchParams, k: string): Date | null {
  const v = param(sp, k);
  return isYmd(v) ? ymdToDate(v) : null;
}

function shanghaiDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+08:00`);
}

export function buildIssueWhere(sp: SearchParams): Prisma.IssueWhereInput {
  const and: Prisma.IssueWhereInput[] = [];
  const statusRaw = param(sp, "status");
  if (statusRaw !== "all") {
    const sts = statusRaw ? list(sp, "status").filter((s): s is IssueStatus => (STATUSES as readonly string[]).includes(s)) : UNFINISHED;
    and.push({ status: { in: sts.length ? sts : UNFINISHED } });
  }
  const eq = (k: string, field: keyof Prisma.IssueWhereInput, allowed?: readonly string[]) => {
    const vs = list(sp, k).filter((v) => !allowed || allowed.includes(v));
    if (vs.length) and.push({ [field]: { in: vs } } as Prisma.IssueWhereInput);
  };
  eq("customer", "customerId");
  eq("batch", "meetingBatchId");
  eq("priority", "priorityId");
  eq("type", "issueTypeId");
  eq("source", "sourceId");
  eq("reporter", "reporterContactId");
  eq("confirm", "confirmationKind", CONFIRM_KIND);
  eq("waiting", "waitingOn", WAITING);

  const assignee = param(sp, "assignee");
  if (assignee === "none") and.push({ assignees: { none: {} } });
  else if (assignee) and.push({ assignees: { some: { userId: assignee } } });

  const today = ymdToDate(todayShanghai())!;
  if (param(sp, "overdue") === "1") and.push({ dueOn: { lt: today }, status: { in: UNFINISHED } });
  if (param(sp, "dueSoon") === "1") and.push({ dueOn: { gte: today, lte: ymdToDate(addDays(todayShanghai(), 6))! } });
  if (param(sp, "noDue") === "1") and.push({ dueOn: null });
  if (param(sp, "draft") === "1") and.push({ titleIsDraft: true });
  if (param(sp, "pendingLong")) {
    // 与提醒同一口径：进入待客户确认的上海日历日距今超过 N 天
    const days = Math.max(0, Number(param(sp, "pendingLong")) || 7);
    and.push({ status: "pending_customer", statusChangedAt: { lt: shanghaiDayStart(addDays(todayShanghai(), -days)) } });
  }
  const createdTo = param(sp, "createdTo");
  if (isYmd(createdTo)) and.push({ createdAt: { lt: shanghaiDayStart(addDays(createdTo, 1)) } });
  const tag = param(sp, "tag");
  if (tag) and.push({ tags: { some: { tag: { nameLc: tag.toLowerCase() } } } });

  const rf = dateParam(sp, "recFrom");
  const rt = dateParam(sp, "recTo");
  if (rf || rt) and.push({ recordedOn: { ...(rf && { gte: rf }), ...(rt && { lte: rt }) } });
  const df = dateParam(sp, "dueFrom");
  const dt = dateParam(sp, "dueTo");
  if (df || dt) and.push({ dueOn: { ...(df && { gte: df }), ...(dt && { lte: dt }) } });

  const q = param(sp, "q").slice(0, 100);
  if (q) {
    const contains = { contains: q, mode: "insensitive" as const };
    const or: Prisma.IssueWhereInput[] = [
      { title: contains },
      { internalNote: contains },
      { nextAction: contains },
      { entries: { some: { body: contains, withdrawnAt: null } } },
      { customer: { name: contains } },
    ];
    const n = Number(q.replace(/^#/, ""));
    if (Number.isInteger(n) && n > 0) or.push({ customerSeq: n });
    and.push({ OR: or });
  }
  return and.length ? { AND: and } : {};
}

export function buildIssueOrder(sp: SearchParams): Prisma.IssueOrderByWithRelationInput[] {
  const dir: Prisma.SortOrder = param(sp, "dir") === "asc" ? "asc" : "desc";
  switch (param(sp, "sort")) {
    case "seq":
      return [{ customer: { name: "asc" } }, { customerSeq: dir }];
    case "recordedOn":
      return [{ recordedOn: { sort: dir, nulls: "last" } }];
    case "dueOn":
      return [{ dueOn: { sort: dir, nulls: "last" } }];
    case "priority":
      return [{ priority: { sortOrder: dir === "desc" ? "asc" : "desc" } }, { updatedAt: "desc" }];
    default:
      return [{ updatedAt: dir }];
  }
}

export const issueListInclude = {
  customer: { select: { id: true, name: true, shortName: true } },
  priority: true,
  issueType: true,
  source: true,
  meetingBatch: { select: { id: true, title: true } },
  reporterContact: { select: { name: true } },
  assignees: { include: { user: { select: { id: true, displayName: true } } } },
  tags: { include: { tag: true } },
  entries: { where: { withdrawnAt: null }, orderBy: { createdAt: "desc" as const }, select: { kind: true, body: true } },
  linksFrom: { select: { toIssue: { select: { id: true, customerSeq: true } } } },
  linksTo: { select: { fromIssue: { select: { id: true, customerSeq: true } } } },
  _count: { select: { evidences: { where: { hiddenAt: null } } } },
} satisfies Prisma.IssueInclude;

export type IssueListRow = Prisma.IssueGetPayload<{ include: typeof issueListInclude }>;

export const PAGE_SIZE = 50;

export async function findIssues(sp: SearchParams, opts: { all?: boolean } = {}) {
  const where = buildIssueWhere(sp);
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  const [rows, total] = await Promise.all([
    prisma.issue.findMany({
      where,
      orderBy: buildIssueOrder(sp),
      include: issueListInclude,
      skip: opts.all ? 0 : (page - 1) * PAGE_SIZE,
      take: opts.all ? 5000 : PAGE_SIZE,
    }),
    prisma.issue.count({ where }),
  ]);
  return { rows, total, page };
}

export function latestEntry(row: { entries: { kind: string; body: string }[] }, kind: "problem" | "solution"): string {
  return row.entries.find((e) => e.kind === kind)?.body ?? "";
}
