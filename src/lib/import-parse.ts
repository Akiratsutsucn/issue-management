// Excel 导入解析（纯函数）：单元格矩阵 → 预览
import { parseExcelDate } from "./excel-date";
import type { IssueStatus } from "./status";

export type Cell = string | number | Date | null;

export interface ParsedHeader {
  customer: string;
  meeting: string;
  meetingOn: string | null;
  updatedOn: string | null;
  updater: string;
  info: string;
  filling: string;
}

export interface ParsedRow {
  rowNo: number;
  seq: number | null;
  title: string;
  priorityText: string;
  completion: string;
  recordedOn: string | null;
  reporterText: string;
  assigneeText: string;
  assigneeNames: string[];
  problem: string;
  solution: string;
  dueOn: string | null;
  statusText: string;
  status: IssueStatus;
  confirmationKind: "confirmed_requirement" | "suggested_pending";
  refs: number[];
  notes: string[];
  warnings: string[];
}

export interface ParseResult {
  header: ParsedHeader;
  hasHeaderArea: boolean;
  rows: ParsedRow[];
  skipped: number;
  dates: string[];
  footnote: string;
  error?: string;
}

const COLS: Record<string, string[]> = {
  seq: ["番号", "編號", "编号", "No", "No."],
  title: ["課題タイトル", "课题标题", "課題", "标题", "タイトル"],
  priority: ["優先度", "优先度", "优先级"],
  completion: ["完了条件", "完了条件（Goal）", "Goal", "完成条件"],
  recordedOn: ["記載日", "记载日", "記入日"],
  reporter: ["起票者"],
  assignee: ["担当者", "担当", "负责人"],
  problem: ["問題点", "问题点"],
  solution: ["解決案", "解决案", "对策"],
  dueOn: ["期限", "期日"],
  status: ["状態", "状态", "ステータス"],
};

const HEADER_LABELS: Record<keyof ParsedHeader, string[]> = {
  customer: ["客先", "客户", "顧客"],
  meeting: ["会谈", "会談", "打合せ", "会議", "会议"],
  meetingOn: ["会谈日", "会談日", "会议日"],
  updatedOn: ["更新日"],
  updater: ["更新者"],
  info: ["会谈信息", "会談情報", "会议信息"],
  filling: ["填写口径", "記入方針", "填写说明"],
};

const STATUS_MAP: [RegExp, IssueStatus][] = [
  [/待客户确认|確認待|客户确认中/, "pending_customer"],
  [/已回答|回答済|回答済み/, "answered"],
  [/处理中|対応中|進行中|进行中/, "in_progress"],
  [/已关闭|クローズ|关闭|取消/, "closed"],
  [/已完成|完了|完成|済/, "done"],
  [/待处理|未着手|未対応|新規/, "open"],
];

export const text = (v: Cell): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\r\n/g, "\n").trim();
};

const norm = (s: string) => s.replace(/[\s　()（）:：]/g, "").toLowerCase();

function matchLabel(cell: string, labels: string[]): boolean {
  const n = norm(cell);
  return !!n && labels.some((l) => n === norm(l) || n.startsWith(norm(l)));
}

export function mapStatus(t: string): { status: IssueStatus; warning?: string } {
  if (!t) return { status: "open" };
  // 否定词优先：「未完成」「未完了」「尚未回答」等不是完成或回答
  if (/^(未|尚未|没有|没|無|无)/.test(t.trim())) return { status: "open", warning: `源表状态「${t}」按待处理导入` };
  for (const [re, st] of STATUS_MAP) {
    if (re.test(t)) {
      if (st === "done") return { status: "pending_customer", warning: `源表状态「${t}」：导入为待客户确认，须补证据与客户确认后再完成` };
      return { status: st };
    }
  }
  return { status: "open", warning: `无法识别状态「${t}」，按待处理导入` };
}

export function splitNames(t: string): string[] {
  return [...new Set(t.split(/[\n、,，;；/／]+/).map((x) => x.trim()).filter(Boolean))];
}

function findHeaderRow(m: Cell[][]): number {
  for (let r = 0; r < Math.min(m.length, 20); r++) {
    const cells = m[r].map(text);
    const hasSeq = cells.some((c) => matchLabel(c, COLS.seq));
    const hits = Object.values(COLS).filter((labels) => cells.some((c) => matchLabel(c, labels))).length;
    if (hasSeq && hits >= 3) return r;
  }
  return -1;
}

function parseHeaderArea(m: Cell[][], upto: number): { header: ParsedHeader; found: boolean } {
  const header: ParsedHeader = { customer: "", meeting: "", meetingOn: null, updatedOn: null, updater: "", info: "", filling: "" };
  let found = false;
  for (let r = 0; r < upto; r++) {
    const row = m[r];
    for (let c = 0; c < row.length; c++) {
      const label = text(row[c]);
      if (!label) continue;
      for (const key of Object.keys(HEADER_LABELS) as (keyof ParsedHeader)[]) {
        if (!matchLabel(label, HEADER_LABELS[key])) continue;
        // 值：同格冒号后，或右侧第一个非空格
        const inline = label.split(/[:：]/).slice(1).join(":").trim();
        let value: Cell = inline || null;
        for (let k = c + 1; !value && k < row.length; k++) if (text(row[k])) value = row[k];
        if (value === null) continue;
        found = true;
        if (key === "meetingOn" || key === "updatedOn") header[key] = parseExcelDate(value).ymd;
        else if (!header[key]) header[key] = text(value);
      }
    }
  }
  if (!header.meetingOn && header.meeting) header.meetingOn = parseExcelDate(header.meeting.match(/\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}/)?.[0] ?? "").ymd;
  return { header, found };
}

function mapColumns(m: Cell[][], hr: number): { map: Record<string, number>; dataStart: number } {
  const map: Record<string, number> = {};
  const head = m[hr].map(text);
  const sub = (m[hr + 1] ?? []).map(text);
  for (const [key, labels] of Object.entries(COLS)) {
    const i = head.findIndex((c) => matchLabel(c, labels));
    if (i >= 0) map[key] = i;
  }
  let usedSub = false;
  for (const key of ["problem", "solution"]) {
    if (map[key] !== undefined) continue;
    const i = sub.findIndex((c) => matchLabel(c, COLS[key]));
    if (i >= 0) {
      map[key] = i;
      usedSub = true;
    }
  }
  return { map, dataStart: hr + (usedSub ? 2 : 1) };
}

const FOOT_RE = /第\s*(\d+)\s*[—\-–~～至到]+\s*(\d+)\s*项[^，。,;；]*?(访谈|访问|ヒアリング|建议|提案)/g;

export function parseFootnote(t: string): Map<number, ParsedRow["confirmationKind"]> {
  const out = new Map<number, ParsedRow["confirmationKind"]>();
  for (const m of t.matchAll(FOOT_RE)) {
    const kind = /建议|提案/.test(m[3]) ? "suggested_pending" : "confirmed_requirement";
    for (let n = Number(m[1]); n <= Number(m[2]) && n - Number(m[1]) < 1000; n++) out.set(n, kind);
  }
  return out;
}

export function parseMatrix(m: Cell[][]): ParseResult {
  const empty: ParsedHeader = { customer: "", meeting: "", meetingOn: null, updatedOn: null, updater: "", info: "", filling: "" };
  const hr = findHeaderRow(m);
  if (hr < 0) return { header: empty, hasHeaderArea: false, rows: [], skipped: 0, dates: [], footnote: "", error: "未找到含「番号」等列名的表头行" };
  const { header, found } = parseHeaderArea(m, hr);
  const { map, dataStart } = mapColumns(m, hr);
  const get = (row: Cell[], key: string): Cell => (map[key] === undefined ? null : (row[map[key]] ?? null));

  const rows: ParsedRow[] = [];
  const footLines: string[] = [];
  let skipped = 0;
  for (let r = dataStart; r < m.length; r++) {
    const row = m[r];
    const others = Object.keys(map).filter((k) => k !== "seq").map((k) => text(get(row, k)));
    const seqRaw = text(get(row, "seq"));
    if (!others.some(Boolean)) {
      const line = row.map(text).filter(Boolean).join(" ");
      if (line && !/^\d+$/.test(line)) footLines.push(line);
      else skipped++;
      continue;
    }
    const seqNum = Number(seqRaw.replace(/^#/, ""));
    const seq = seqRaw && Number.isInteger(seqNum) && seqNum > 0 ? seqNum : null;
    const warnings: string[] = [];
    const notes: string[] = [];
    const rec = parseExcelDate(get(row, "recordedOn"));
    const due = parseExcelDate(get(row, "dueOn"));
    if (rec.note) (rec.ymd ? notes : warnings).push(`记载日：${rec.note}`);
    if (due.note) (due.ymd ? notes : warnings).push(`期限：${due.note}`);
    const st = mapStatus(text(get(row, "status")));
    if (st.warning) warnings.push(st.warning);
    if (seqRaw && !seq) warnings.push(`番号「${seqRaw}」无效，将自动分配`);
    const title = text(get(row, "title"));
    if (!title) warnings.push("标题为空，导入后标「标题待补」");
    const problem = text(get(row, "problem"));
    const solution = text(get(row, "solution"));
    const refs = [...`${problem}\n${solution}`.matchAll(/本表第\s*(\d+)\s*项/g)].map((x) => Number(x[1])).filter((n) => n !== seq);
    const assigneeText = text(get(row, "assignee"));
    rows.push({
      rowNo: r + 1, seq, title, priorityText: text(get(row, "priority")), completion: text(get(row, "completion")),
      recordedOn: rec.ymd, reporterText: text(get(row, "reporter")), assigneeText, assigneeNames: splitNames(assigneeText),
      problem, solution, dueOn: due.ymd, statusText: text(get(row, "status")), status: st.status,
      confirmationKind: "suggested_pending", refs: [...new Set(refs)], notes, warnings,
    });
  }
  const footnote = footLines.join("\n");
  const foot = parseFootnote(footnote);
  for (const row of rows) if (row.seq && foot.has(row.seq)) row.confirmationKind = foot.get(row.seq)!;
  const dates = [...new Set(rows.map((r) => r.recordedOn).filter((d): d is string => !!d))].sort();
  return { header, hasHeaderArea: found, rows, skipped, dates, footnote };
}
