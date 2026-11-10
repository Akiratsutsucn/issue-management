// 站内提醒生成。失败只记日志，绝不影响课题读写。
import { dateToYmd, todayShanghai } from "../dates";
import { evaluateReminders, type ReminderSettings } from "../reminder-rules";
import { UNFINISHED } from "../status";
import { prisma } from "./db";

const issueInclude = { priority: true, assignees: true } as const;

async function context(): Promise<{ s: ReminderSettings; adminIds: string[]; today: string }> {
  const [t, admins] = await Promise.all([
    prisma.teamSettings.findUnique({ where: { id: 1 } }),
    prisma.user.findMany({ where: { role: "admin", isActive: true }, select: { id: true } }),
  ]);
  return {
    s: {
      dueSoonDays: t?.reminderDueSoonDays ?? 3,
      pendingDays: t?.reminderPendingDays ?? 7,
      highNoDueGraceDays: t?.reminderHighNoDueGraceDays ?? 1,
    },
    adminIds: admins.map((a) => a.id),
    today: todayShanghai(),
  };
}

type IssueWithRefs = Awaited<ReturnType<typeof loadIssues>>[number];

function loadIssues(where: object) {
  return prisma.issue.findMany({ where: { ...where, status: { in: UNFINISHED } }, include: issueInclude });
}

async function generateFor(issues: IssueWithRefs[]): Promise<number> {
  const { s, adminIds, today } = await context();
  let created = 0;
  for (const i of issues) {
    const hits = evaluateReminders(
      {
        status: i.status,
        priorityKey: i.priority.key,
        dueOn: i.dueOn ? dateToYmd(i.dueOn) : null,
        assigneeIds: i.assignees.map((a) => a.userId),
        statusChangedAt: i.statusChangedAt,
        createdAt: i.createdAt,
        updatedById: i.updatedById,
      },
      s,
      today,
      adminIds,
    );
    for (const h of hits) {
      const r = await prisma.notification.createMany({
        data: h.recipients.map((userId) => ({ userId, issueId: i.id, type: h.type, reason: h.reason, dayKey: today })),
        skipDuplicates: true, // 每课题每规则每人每日最多一条
      });
      created += r.count;
    }
  }
  return created;
}

export function remindersEnabled(): boolean {
  return process.env.REMINDERS_ENABLED !== "false";
}

export async function runReminderSweep(): Promise<{ ok: boolean; created: number; message: string }> {
  if (!remindersEnabled()) return { ok: true, created: 0, message: "提醒任务已停用" };
  try {
    const created = await generateFor(await loadIssues({}));
    const message = `生成 ${created} 条提醒`;
    await prisma.jobRun.create({ data: { job: "reminders", ok: true, message } });
    return { ok: true, created, message };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[reminders] sweep failed:", message);
    await prisma.jobRun.create({ data: { job: "reminders", ok: false, message: message.slice(0, 500) } }).catch(() => undefined);
    return { ok: false, created: 0, message };
  }
}

/** 写入后异步刷新单个课题，不等待、不抛错 */
export function refreshRemindersSafely(issueId: string): void {
  if (!remindersEnabled()) return;
  setTimeout(() => {
    loadIssues({ id: issueId })
      .then(generateFor)
      .catch((e) => console.error("[reminders] refresh failed:", e instanceof Error ? e.message : e));
  }, 0);
}
