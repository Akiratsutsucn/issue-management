// 导出：/api/export/list?筛选参数 | /api/export/customer/:id | /api/export/meeting/:id
// 通用参数：forCustomer=1 隐藏内部备注；zip=1 同时打包证据
import { NextResponse } from "next/server";
import { dateToYmd } from "@/lib/dates";
import { apiUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { exportInclude, exportResponse } from "@/lib/server/export";
import { buildIssueOrder, buildIssueWhere } from "@/lib/server/issue-query";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ scope: string; id?: string[] }> }) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { scope, id: idParts } = await ctx.params;
  const id = idParts?.[0] ?? "";
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  const opt = { forCustomer: sp.forCustomer === "1", zip: sp.zip === "1" };

  try {
    if (scope === "list") {
      const issues = await prisma.issue.findMany({ where: buildIssueWhere(sp), orderBy: buildIssueOrder(sp), include: exportInclude, take: 5000 });
      return await exportResponse(issues, "课题列表", opt, user.id, "list");
    }
    if (scope === "customer") {
      const c = await prisma.customer.findUnique({ where: { id } });
      if (!c) return NextResponse.json({ error: "客户不存在" }, { status: 404 });
      const issues = await prisma.issue.findMany({ where: { customerId: id }, orderBy: { customerSeq: "asc" }, include: exportInclude });
      return await exportResponse(issues, c.shortName || c.name, opt, user.id, `customer:${c.name}`);
    }
    if (scope === "meeting") {
      const m = await prisma.meetingBatch.findUnique({
        where: { id },
        include: { customer: true, attendees: { orderBy: { sortOrder: "asc" }, include: { contact: true } } },
      });
      if (!m) return NextResponse.json({ error: "会谈不存在" }, { status: 404 });
      const issues = await prisma.issue.findMany({ where: { meetingBatchId: id }, orderBy: { customerSeq: "asc" }, include: exportInclude });
      const userIds = m.attendees.map((a) => a.userId).filter((x): x is string => !!x);
      const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } });
      const attendees = m.attendees
        .map((a) => (a.kind === "internal_user" ? users.find((u) => u.id === a.userId)?.displayName : a.kind === "contact" ? a.contact?.name : `${a.placeholderLabel}（待补）`))
        .filter(Boolean)
        .join("、");
      const header = {
        customer: m.customer.name, title: m.title, meetingOn: dateToYmd(m.meetingOn), updatedOn: dateToYmd(m.updatedOn),
        updater: m.updaterText, info: m.informationText, filling: m.fillingNote,
        sourceDocument: m.sourceDocument, division: m.divisionNote, attendees,
      };
      return await exportResponse(issues, `${m.customer.shortName || m.customer.name}-${m.title}`, { ...opt, header }, user.id, `meeting:${m.title}`);
    }
  } catch (e) {
    console.error("[export] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "导出失败" }, { status: 500 });
  }
  return NextResponse.json({ error: "无效导出范围" }, { status: 400 });
}
