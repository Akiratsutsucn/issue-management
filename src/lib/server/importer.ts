// Excel 导入：读取工作簿 → 预览入库 → 按用户确认执行
import ExcelJS from "exceljs";
import type { ImportStrategy, Prisma } from "@prisma/client";
import { ymdToDate, todayShanghai } from "../dates";
import { parseMatrix, type Cell, type ParseResult, type ParsedRow } from "../import-parse";
import { richToText, textToRich } from "../sanitize";
import { recordIssueEvent, writeAudit } from "./audit";
import type { SessionUser } from "./auth";
import { prisma, type Tx } from "./db";

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if ("error" in v) return null;
  }
  return String(v);
}

export async function readWorkbook(buf: Buffer, sheetName?: string): Promise<{ sheets: string[]; sheet: string; matrix: Cell[][] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const sheets = wb.worksheets.map((w) => w.name);
  const ws = (sheetName && wb.getWorksheet(sheetName)) || wb.getWorksheet("課題管理") || wb.worksheets[0];
  if (!ws) throw new Error("工作簿中没有工作表");
  const matrix: Cell[][] = [];
  const width = Math.min(ws.columnCount, 60);
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    if (r > 3000) return;
    const out: Cell[] = [];
    for (let c = 1; c <= width; c++) {
      const cell = row.getCell(c);
      // 合并单元格只取主格的值
      out.push(cell.isMerged && cell.master !== cell ? null : cellValue(cell.value));
    }
    matrix[r - 1] = out;
  });
  for (let i = 0; i < matrix.length; i++) matrix[i] ??= [];
  return { sheets, sheet: ws.name, matrix };
}

export interface PreviewData extends ParseResult {
  sheet: string;
  sheets: string[];
  matchedCustomerId: string | null;
  priorityMatch: Record<string, string | null>;
  userMatch: Record<string, string | null>;
}

export async function buildPreview(buf: Buffer, sheetName?: string): Promise<PreviewData> {
  const { sheets, sheet, matrix } = await readWorkbook(buf, sheetName);
  const parsed = parseMatrix(matrix);
  const [customers, priorities, users] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, name: true, shortName: true } }),
    prisma.priority.findMany(),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, displayName: true, aliases: true } }),
  ]);
  const cName = parsed.header.customer.trim();
  const matched = cName ? customers.find((c) => c.name === cName || (c.shortName && c.shortName === cName)) : undefined;
  const priorityMatch: Record<string, string | null> = {};
  for (const t of new Set(parsed.rows.map((r) => r.priorityText))) {
    const p = priorities.find((x) => x.label === t || x.key === t.toLowerCase());
    priorityMatch[t] = p?.id ?? null;
  }
  const userMatch: Record<string, string | null> = {};
  for (const n of new Set(parsed.rows.flatMap((r) => r.assigneeNames))) {
    userMatch[n] = users.find((u) => u.displayName === n || u.aliases.includes(n))?.id ?? null;
  }
  return { ...parsed, sheet, sheets, matchedCustomerId: matched?.id ?? null, priorityMatch, userMatch };
}

export interface ExecuteInput {
  customerId: string | null;
  newCustomerName: string;
  batchMode: "header" | "byDate" | "none";
  strategy: ImportStrategy;
  fillRecordedFromMeeting: boolean;
  skipRows: number[];
  kinds: Record<number, ParsedRow["confirmationKind"]>;
}

export interface ImportReport {
  created: number;
  updated: number;
  skipped: number;
  failed: { rowNo: number; reason: string }[];
  linked: number;
  customerId: string;
  rows: { rowNo: number; result: string; issueId?: string; seq?: number }[];
}

async function ensureBatch(tx: Tx, cache: Map<string, string>, customerId: string, key: string, data: Prisma.MeetingBatchUncheckedCreateInput): Promise<string> {
  const hit = cache.get(key);
  if (hit) return hit;
  const b = await tx.meetingBatch.create({ data });
  cache.set(key, b.id);
  return b.id;
}

export async function executeImport(jobId: string, input: ExecuteInput, user: SessionUser): Promise<ImportReport> {
  // 原子认领任务，防止重复提交执行两次
  const claimed = await prisma.importJob.updateMany({ where: { id: jobId, status: "preview" }, data: { status: "running" } });
  if (claimed.count === 0) throw new Error("导入任务不存在或已执行");
  const job = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
  const pv = job.preview as unknown as PreviewData;
  const medium = await prisma.priority.findUnique({ where: { key: "medium" } });
  if (!medium) throw new Error("缺少默认优先级");
  const today = todayShanghai();

  const settings = await prisma.teamSettings.findUnique({ where: { id: 1 } });
  const pendingLinks: [string, string][] = [];
  let report: ImportReport;
  try {
  report = await prisma.$transaction(
    async (tx) => {
      let customerId = input.customerId;
      if (!customerId) {
        const name = input.newCustomerName.trim();
        if (!name) throw new Error("请选择或新建目标客户");
        let c = await tx.customer.findUnique({ where: { name } });
        if (!c) {
          if (user.role !== "admin" && settings && !settings.memberCanCreateCustomer) throw new Error("请选择已有客户：当前设置不允许成员新建客户");
          c = await tx.customer.create({ data: { name } });
          await writeAudit(tx, { entityType: "customer", entityId: c.id, action: "create", actorId: user.id, summary: `导入时新建客户 ${name}` });
        }
        customerId = c.id;
      }
      const h = pv.header;
      const batches = new Map<string, string>();
      const headerBatch = () =>
        ensureBatch(tx, batches, customerId!, "header", {
          customerId: customerId!, title: h.meeting || `${h.meetingOn ?? today} 会谈`, meetingOn: ymdToDate(h.meetingOn),
          updatedOn: ymdToDate(h.updatedOn), updaterText: h.updater, informationText: h.info, fillingNote: h.filling, importFileName: job.fileName,
        });
      const r: ImportReport = { created: 0, updated: 0, skipped: 0, failed: [], linked: 0, customerId, rows: [] };
      const seqToId = new Map<number, string>();
      let nextSeq = ((await tx.issue.aggregate({ where: { customerId }, _max: { customerSeq: true } }))._max.customerSeq ?? 0) + 1;

      for (const row of pv.rows) {
        if (input.skipRows.includes(row.rowNo)) {
          r.skipped++;
          r.rows.push({ rowNo: row.rowNo, result: "按选择跳过" });
          continue;
        }
        const recordedOn = row.recordedOn ?? (input.fillRecordedFromMeeting ? h.meetingOn : null);
        let meetingBatchId: string | null = null;
        if (input.batchMode === "header") meetingBatchId = await headerBatch();
        else if (input.batchMode === "byDate") {
          const d = row.recordedOn;
          meetingBatchId = !d || d === h.meetingOn ? await headerBatch()
            : await ensureBatch(tx, batches, customerId, d, { customerId, title: `${d} 跟进`, meetingOn: ymdToDate(d), importFileName: job.fileName });
        }
        const assigneeIds = [...new Set(row.assigneeNames.map((n) => pv.userMatch[n]).filter((x): x is string => !!x))];
        const scalars = {
          title: row.title, titleIsDraft: !row.title, priorityId: pv.priorityMatch[row.priorityText] ?? medium.id,
          completionCondition: textToRich(row.completion), recordedOn: ymdToDate(recordedOn), dueOn: ymdToDate(row.dueOn),
          reporterText: row.reporterText, assigneeText: row.assigneeText, confirmationKind: input.kinds[row.rowNo] ?? row.confirmationKind,
        };
        const existing = row.seq ? await tx.issue.findUnique({ where: { customerId_customerSeq: { customerId, customerSeq: row.seq } }, include: { entries: true, assignees: true } }) : null;

        if (existing) {
          if (input.strategy === "skip_existing") {
            r.skipped++;
            r.rows.push({ rowNo: row.rowNo, result: `#${row.seq} 已存在，跳过`, issueId: existing.id, seq: existing.customerSeq });
            seqToId.set(existing.customerSeq, existing.id);
            continue;
          }
          const data: Record<string, unknown> = { updatedById: user.id, sourceImportId: jobId };
          const overwrite = input.strategy === "overwrite_scalars";
          // 默认值（未识别优先度、默认确认类别、标题待补标记）不得覆盖已有数据
          const { titleIsDraft: _d, priorityId: _p, confirmationKind: _k, ...plain } = scalars;
          for (const [k, v] of Object.entries(plain)) {
            const cur = (existing as Record<string, unknown>)[k];
            const blank = cur === null || cur === "";
            if (overwrite ? v !== "" && v !== null : blank) data[k] = v;
          }
          if (data.title) data.titleIsDraft = false;
          if (overwrite && pv.priorityMatch[row.priorityText]) data.priorityId = pv.priorityMatch[row.priorityText];
          const chosenKind = input.kinds[row.rowNo];
          if (overwrite && chosenKind && (chosenKind !== "suggested_pending" || row.confirmationKind !== "suggested_pending")) data.confirmationKind = chosenKind;
          await tx.issue.update({ where: { id: existing.id }, data });
          // 问题点/解决案只追加，不覆盖
          let appended = 0;
          for (const [kind, body] of [["problem", row.problem], ["solution", row.solution]] as const) {
            if (!body) continue;
            const dup = existing.entries.some((e) => e.kind === kind && richToText(e.body) === body);
            if (!dup) {
              await tx.issueEntry.create({ data: { issueId: existing.id, kind, body: textToRich(body), authorId: user.id } });
              appended++;
            }
          }
          const newA = assigneeIds.filter((a) => !existing.assignees.some((x) => x.userId === a));
          if (newA.length) await tx.issueAssignee.createMany({ data: newA.map((userId) => ({ issueId: existing.id, userId })) });
          await recordIssueEvent(tx, existing.id, user.id, "import_update", `导入更新（${job.fileName} 第 ${row.rowNo} 行，追加 ${appended} 条进展）`);
          r.updated++;
          r.rows.push({ rowNo: row.rowNo, result: `更新 #${existing.customerSeq}`, issueId: existing.id, seq: existing.customerSeq });
          seqToId.set(existing.customerSeq, existing.id);
          continue;
        }

        const seq = row.seq ?? nextSeq;
        if (row.seq && (await tx.issue.findUnique({ where: { customerId_customerSeq: { customerId, customerSeq: seq } } }))) {
          r.failed.push({ rowNo: row.rowNo, reason: `番号 ${seq} 冲突` });
          continue;
        }
        nextSeq = Math.max(nextSeq, seq + 1);
        const issue = await tx.issue.create({
          data: {
            ...scalars, customerId, customerSeq: seq, meetingBatchId, status: row.status,
            // 首次回答日源表没有，留空，用户可在详情补录（避免把记载日当回答日扭曲响应统计）
            sourceImportId: jobId, createdById: user.id, updatedById: user.id,
            assignees: { create: assigneeIds.map((userId) => ({ userId })) },
          },
        });
        for (const [kind, body] of [["problem", row.problem], ["solution", row.solution]] as const) {
          if (body) await tx.issueEntry.create({ data: { issueId: issue.id, kind, body: textToRich(body), authorId: user.id } });
        }
        await recordIssueEvent(tx, issue.id, user.id, "import_create", `导入创建 #${seq}（${job.fileName} 第 ${row.rowNo} 行${row.statusText ? `，源状态「${row.statusText}」` : ""}）`);
        seqToId.set(seq, issue.id);
        r.created++;
        r.rows.push({ rowNo: row.rowNo, result: `创建 #${seq}`, issueId: issue.id, seq });
      }

      for (const row of pv.rows) {
        const from = row.seq ? seqToId.get(row.seq) : undefined;
        for (const ref of row.refs) {
          const to = seqToId.get(ref);
          if (from && to && from !== to) pendingLinks.push([from, to]);
        }
      }
      await tx.importJob.update({ where: { id: jobId }, data: { status: "done", strategy: input.strategy, report: r as unknown as Prisma.InputJsonValue, finishedAt: new Date() } });
      await writeAudit(tx, {
        entityType: "import", entityId: jobId, action: "execute", actorId: user.id,
        summary: `导入 ${job.fileName}：创建 ${r.created}、更新 ${r.updated}、跳过 ${r.skipped}、失败 ${r.failed.length}、关联 ${r.linked}`,
      });
      return r;
    },
    { timeout: 120_000 },
  );
  } catch (e) {
    await prisma.importJob.update({ where: { id: jobId }, data: { status: "preview" } }).catch(() => undefined);
    throw e;
  }
  // 建议的关联在主事务之后单独建立：失败不阻断导入
  for (const [from, to] of pendingLinks) {
    try {
      const exists = await prisma.issueLink.findFirst({ where: { OR: [{ fromIssueId: from, toIssueId: to }, { fromIssueId: to, toIssueId: from }] } });
      if (!exists) {
        await prisma.issueLink.create({ data: { fromIssueId: from, toIssueId: to, note: "导入时按「本表第 n 项」建立" } });
        report.linked++;
      }
    } catch (e) {
      console.error("[import] link failed:", e instanceof Error ? e.message : e);
    }
  }
  if (report.linked) {
    await prisma.importJob.update({ where: { id: jobId }, data: { report: report as unknown as Prisma.InputJsonValue } }).catch(() => undefined);
  }
  return report;
}
