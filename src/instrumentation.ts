// 进程内定时任务：每 15 分钟生成提醒。失败不影响请求。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.REMINDERS_ENABLED === "false") return;
  const { runReminderSweep } = await import("./lib/server/reminders");
  const minutes = Math.min(30, Math.max(15, Number(process.env.REMINDER_INTERVAL_MINUTES ?? 15)));
  const tick = () => void runReminderSweep().catch(() => undefined);
  setTimeout(tick, 30_000);
  setInterval(tick, minutes * 60_000);
}
