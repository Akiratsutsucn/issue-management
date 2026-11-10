// 业务日按 Asia/Shanghai 理解；@db.Date 字段以 UTC 零点 Date 存取。
export const TZ = "Asia/Shanghai";

const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dtFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(s: string): boolean {
  if (!YMD_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 某一时刻在上海的日历日 */
export function shanghaiYmd(at: Date = new Date()): string {
  return ymdFmt.format(at);
}

export function todayShanghai(): string {
  return shanghaiYmd(new Date());
}

/** @db.Date 列 → YYYY-MM-DD */
export function dateToYmd(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

/** YYYY-MM-DD → @db.Date 列；空串返回 null */
export function ymdToDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  if (!isYmd(s)) throw new Error(`日期格式无效：${s}`);
  return new Date(`${s}T00:00:00Z`);
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** b - a 的天数 */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function fmtDateTime(d: Date | null | undefined): string {
  return d ? dtFmt.format(d).replace(/\//g, "-") : "—";
}

export function fmtDate(d: Date | null | undefined): string {
  return d ? dateToYmd(d) : "—";
}
