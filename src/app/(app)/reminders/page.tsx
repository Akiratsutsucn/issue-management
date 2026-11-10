import { TitleText } from "@/components/Pills";
import { fmtDateTime } from "@/lib/dates";
import { REMINDER_LABEL } from "@/lib/reminder-rules";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { remindersEnabled } from "@/lib/server/reminders";
import { markAllReadAction, openReminderAction, runSweepAction } from "./actions";

export default async function RemindersPage() {
  const user = await requireUser();
  const [items, lastRun] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: { issue: { include: { customer: { select: { name: true } } } } },
    }),
    prisma.jobRun.findFirst({ where: { job: "reminders" }, orderBy: { at: "desc" } }),
  ]);
  const unread = items.filter((i) => i.status === "unread").length;

  return (
    <main className="page stack">
      <div className="page-head">
        <div>
          <h1>提醒</h1>
          <div className="sub">
            未读 {unread} · {remindersEnabled() ? "提醒任务运行中" : "提醒任务已停用"}
            {lastRun && ` · 上次 ${fmtDateTime(lastRun.at)}${lastRun.ok ? "" : "（失败，已记日志）"}`}
          </div>
        </div>
        <div className="row">
          {user.role === "admin" && <form action={runSweepAction}><button className="btn" type="submit">立即检查</button></form>}
          {unread > 0 && <form action={markAllReadAction}><button className="btn" type="submit">全部标为已读</button></form>}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>类型</th><th>客户</th><th>课题</th><th>原因</th><th>时间</th></tr></thead>
          <tbody>
            {items.length === 0 ? (
              <tr className="empty-row"><td colSpan={5}>没有提醒</td></tr>
            ) : items.map((n) => (
              <tr key={n.id} style={n.status === "read" ? { color: "var(--muted)" } : undefined}>
                <td className="nowrap">{n.status === "unread" && <span className="dot" style={{ background: "var(--danger)", marginRight: 6 }} />}{REMINDER_LABEL[n.type]}</td>
                <td>{n.issue.customer.name}</td>
                <td>
                  <form action={openReminderAction.bind(null, n.id)}>
                    <button type="submit" className="btn-text" style={{ border: 0, background: "none", font: "inherit", cursor: "pointer", padding: 0, color: "inherit", textAlign: "left" }}>
                      <span className="num">#{n.issue.customerSeq}</span> <TitleText title={n.issue.title} />
                    </button>
                  </form>
                </td>
                <td>{n.reason}</td>
                <td className="num small nowrap">{fmtDateTime(n.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">同一课题同一规则每日最多一条。条件解除后不再产生，已有记录保留。邮件与企微通知为二期。</p>
    </main>
  );
}
