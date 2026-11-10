import { describe, expect, it } from "vitest";
import { addDays, dateToYmd, diffDays, isYmd, shanghaiYmd, ymdToDate } from "@/lib/dates";
import { parseExcelDate, serialToYmd } from "@/lib/excel-date";

describe("日期", () => {
  it("上海日历：UTC 16:30 已是次日", () => {
    expect(shanghaiYmd(new Date("2026-11-09T16:30:00Z"))).toBe("2026-11-10");
    expect(shanghaiYmd(new Date("2026-11-09T15:59:00Z"))).toBe("2026-11-09");
  });

  it("ymd 往返与校验", () => {
    expect(dateToYmd(ymdToDate("2026-02-28"))).toBe("2026-02-28");
    expect(isYmd("2026-02-30")).toBe(false);
    expect(() => ymdToDate("2026/1/1")).toThrow();
    expect(ymdToDate("")).toBeNull();
  });

  it("加减天数", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(diffDays("2026-11-01", "2026-11-10")).toBe(9);
  });
});

describe("Excel 日期", () => {
  it("序列 46324 → 2026-10-29", () => {
    expect(serialToYmd(46324)).toBe("2026-10-29");
    expect(parseExcelDate(46324).ymd).toBe("2026-10-29");
    expect(parseExcelDate("46324").ymd).toBe("2026-10-29");
  });

  it("文本与 Date", () => {
    expect(parseExcelDate("2026-10-29").ymd).toBe("2026-10-29");
    expect(parseExcelDate("2026/1/5").ymd).toBe("2026-01-05");
    expect(parseExcelDate("2026年1月5日").ymd).toBe("2026-01-05");
    expect(parseExcelDate(new Date(Date.UTC(2026, 9, 29))).ymd).toBe("2026-10-29");
  });

  it("空与无法识别", () => {
    expect(parseExcelDate(null)).toEqual({ ymd: null, note: null });
    expect(parseExcelDate("下周").ymd).toBeNull();
    expect(parseExcelDate("下周").note).toContain("无法识别");
    expect(parseExcelDate(12).ymd).toBeNull();
  });
});
