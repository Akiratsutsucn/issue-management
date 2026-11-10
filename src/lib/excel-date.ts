// Excel 单元格日期解析（纯函数）
import { isYmd } from "./dates";

/** Windows 1900 体系：序列 1 = 1899-12-31，以 1899-12-30 为零点（含 1900 闰年 bug 的修正） */
export function serialToYmd(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export interface ParsedDate {
  ymd: string | null;
  note: string | null;
}

/** 接受 Date、序列数字、yyyy-mm-dd / yyyy/m/d / yyyy.m.d 文本 */
export function parseExcelDate(value: unknown): ParsedDate {
  if (value === null || value === undefined || value === "") return { ymd: null, note: null };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { ymd: null, note: "日期无效" };
    // exceljs 把日期单元格读为 UTC 零点
    return { ymd: value.toISOString().slice(0, 10), note: null };
  }
  if (typeof value === "number") {
    if (value > 20000 && value < 80000) {
      const ymd = serialToYmd(value);
      return { ymd, note: `序列 ${value} → ${ymd}` };
    }
    return { ymd: null, note: `无法识别的数字 ${value}` };
  }
  const s = String(value).trim();
  if (!s) return { ymd: null, note: null };
  if (/^\d{5}(\.\d+)?$/.test(s)) return parseExcelDate(Number(s));
  const m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/);
  if (m) {
    const ymd = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    if (isYmd(ymd)) return { ymd, note: null };
  }
  return { ymd: null, note: `无法识别的日期「${s}」` };
}
