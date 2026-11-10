// 导出 xlsx（还原必要 11 列 + 附加列），可选打包证据 zip
import ExcelJS from "exceljs";
import JSZip from "jszip";
import type { Prisma } from "@prisma/client";
import { dateToYmd, fmtDate, fmtDateTime, shanghaiYmd } from "../dates";
import { CONFIRM_LABEL, WAITING_LABEL } from "../labels";
import { richToText } from "../sanitize";
import { STATUS_LABEL } from "../status";
import { writeAudit } from "./audit";
import { prisma } from "./db";
import { storage } from "./storage";

export const exportInclude = {
  customer: true,
  meetingBatch: true,
  priority: true,
  issueType: true,
  reporterContact: true,
  assignees: { include: { user: true } },
  entries: { where: { withdrawnAt: null }, orderBy: { createdAt: "asc" as const } },
  evidences: { where: { hiddenAt: null } },
  linksFrom: { include: { toIssue: { select: { customerSeq: true, customerId: true } } } },
  linksTo: { include: { fromIssue: { select: { customerSeq: true, customerId: true } } } },
} satisfies Prisma.IssueInclude;

type ExportIssue = Prisma.IssueGetPayload<{ include: typeof exportInclude }>;

export interface BatchHeader {
  customer: string;
  title: string;
  meetingOn: string;
  updatedOn: string;
  updater: string;
  info: string;
  filling: string;
  sourceDocument: string;
  division: string;
  attendees: string;
}

export interface ExportOptions {
  forCustomer: boolean;
  header?: BatchHeader;
  sheetName?: string;
}

function entriesText(i: ExportIssue, kind: "problem" | "solution"): string {
  const list = i.entries.filter((e) => e.kind === kind);
  if (list.length <= 1) return richToText(list[0]?.body ?? "");
  return list.map((e) => `【${shanghaiYmd(e.createdAt)}】${richToText(e.body)}`).join("\n");
}

function linkSeqs(i: ExportIssue): string {
  const other = [
    ...i.linksFrom.map((l) => l.toIssue),
    ...i.linksTo.map((l) => l.fromIssue),
  ];
  return other.map((o) => (o.customerId === i.customerId ? `#${o.customerSeq}` : `#${o.customerSeq}(他客户)`)).join("、");
}

export async function buildWorkbook(issues: ExportIssue[], opt: ExportOptions): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "课题管理系统";
  const ws = wb.addWorksheet(opt.sheetName ?? "課題管理");
  const font = { name: "微软雅黑", size: 10 };
  let r = 1;
  if (opt.header) {
    const h = opt.header;
    const rows: [string, string][] = [
      ["客先", h.customer],
      ["会谈", `${h.title}${h.meetingOn ? `（${h.meetingOn}）` : ""}`],
      ["更新日 / 更新者", `${h.updatedOn || "—"} / ${h.updater || "—"}`],
      ["出席", h.attendees],
      ["会谈信息", h.info],
      ["填写口径", h.filling],
      ["来源文档", h.sourceDocument],
      ["分工建议", h.division],
    ];
    for (const [k, v] of rows) {
      ws.getRow(r).values = [k, v];
      ws.getRow(r).font = font;
      ws.getCell(r, 1).font = { ...font, bold: true };
      r++;
    }
    r++;
  }
  const headers = [
    "番号", "課題タイトル", "優先度", "完了条件（Goal）", "記載日", "起票者", "担当者", "問題点", "解決案", "期限", "状態",
    "客户", "会谈/批次", "确认类别", "课题类型", "待谁处理", "下一步行动", "首次回答日", "完成日", "客户确认", "证据数量", "关联番号", "更新时间",
    ...(opt.forCustomer ? [] : ["内部备注"]),
  ];
  const headRow = ws.getRow(r);
  headRow.values = headers;
  headRow.font = { ...font, bold: true };
  headRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1EEE9" } };
  r++;
  for (const i of issues) {
    const assignees = [...i.assignees.map((a) => a.user.displayName), ...(i.teamAssigned ? ["团队承接"] : [])].join("、") || i.assigneeText;
    const confirm = i.completionConfirmName ? `${i.completionConfirmName} ${fmtDate(i.completionConfirmedAt)}${i.completionConfirmMethod ? ` ${i.completionConfirmMethod}` : ""}` : "";
    const row = ws.getRow(r++);
    row.values = [
      i.customerSeq, i.title || "（标题待补）", i.priority.label, richToText(i.completionCondition), dateToYmd(i.recordedOn),
      i.reporterContact?.name ?? i.reporterText, assignees, entriesText(i, "problem"), entriesText(i, "solution"),
      dateToYmd(i.dueOn), STATUS_LABEL[i.status],
      i.customer.name, i.meetingBatch?.title ?? "", CONFIRM_LABEL[i.confirmationKind], i.issueType?.label ?? "", WAITING_LABEL[i.waitingOn], i.nextAction,
      dateToYmd(i.firstAnsweredAt), dateToYmd(i.completedAt), confirm, i.evidences.length, linkSeqs(i), fmtDateTime(i.updatedAt),
      ...(opt.forCustomer ? [] : [richToText(i.internalNote)]),
    ];
    row.font = font;
    row.alignment = { vertical: "top", wrapText: true };
  }
  const widths = [6, 30, 7, 30, 11, 10, 14, 44, 44, 11, 10, 16, 18, 16, 9, 9, 24, 11, 11, 18, 8, 12, 16, 30];
  widths.slice(0, headers.length).forEach((w, k) => (ws.getColumn(k + 1).width = w));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildZip(xlsxName: string, xlsx: Buffer, issues: ExportIssue[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(xlsxName, xlsx);
  const st = storage();
  for (const i of issues) {
    for (const e of i.evidences) {
      try {
        zip.file(`证据/#${i.customerSeq}/${e.id.slice(-6)}-${e.fileName}`, await st.get(e.storageKey));
      } catch {
        zip.file(`证据/#${i.customerSeq}/缺失-${e.fileName}.txt`, "文件在存储中未找到");
      }
    }
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function exportResponse(
  issues: ExportIssue[],
  baseName: string,
  opt: ExportOptions & { zip: boolean },
  actorId: string,
  scope: string,
): Promise<Response> {
  const stamp = shanghaiYmd().replace(/-/g, "");
  const name = `${baseName}-${stamp}${opt.forCustomer ? "-客户版" : ""}`;
  const xlsx = await buildWorkbook(issues, opt);
  const body = opt.zip ? await buildZip(`${name}.xlsx`, xlsx, issues) : xlsx;
  await writeAudit(prisma, {
    entityType: "export", entityId: scope, action: "export", actorId,
    summary: `导出 ${scope}：${issues.length} 条${opt.forCustomer ? "（客户版，隐藏内部备注）" : ""}${opt.zip ? "，含证据" : ""}`,
  });
  const fileName = `${name}.${opt.zip ? "zip" : "xlsx"}`;
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": opt.zip ? "application/zip" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
