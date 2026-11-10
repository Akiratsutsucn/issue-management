"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { runReminderSweep } from "@/lib/server/reminders";

export async function openReminderAction(id: string): Promise<void> {
  const user = await requireUser();
  const n = await prisma.notification.findFirst({ where: { id, userId: user.id } });
  if (!n) redirect("/reminders");
  if (n.status === "unread") {
    await prisma.$transaction([
      prisma.notification.update({ where: { id }, data: { status: "read", readAt: new Date() } }),
      prisma.activity.create({ data: { issueId: n.issueId, actorId: user.id, action: "reminder_read", summary: "提醒已读" } }),
    ]);
  }
  revalidatePath("/", "layout");
  redirect(`/issues/${n.issueId}`);
}

export async function markAllReadAction(): Promise<void> {
  const user = await requireUser();
  await prisma.notification.updateMany({ where: { userId: user.id, status: "unread" }, data: { status: "read", readAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function runSweepAction(): Promise<void> {
  const user = await requireUser();
  if (user.role !== "admin") return;
  await runReminderSweep();
  revalidatePath("/", "layout");
}
