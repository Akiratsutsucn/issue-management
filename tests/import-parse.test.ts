import { describe, expect, it } from "vitest";
import { mapStatus, parseFootnote, parseMatrix, splitNames, type Cell } from "@/lib/import-parse";

// 自制样表：表头区 + 两行列名（詳細拆分）+ 数据 + 脚注。内容均为虚构。
const sheet: Cell[][] = [
  ["客先", "测试客户甲", null, null],
  ["会谈", "2026-10-20 会谈", "更新日", 46325],
  ["更新者", "王"],
  ["会谈信息", "线上会议"],
  ["填写口径", "按客户原话记录"],
  ["番号", "課題タイトル", "優先度", "完了条件", "記載日", "起票者", "担当者", "詳細", null, "期限", "状態"],
  [null, null, null, null, null, null, null, "問題点", "解決案", null, null],
  [1, "账号整合", "高", "完成迁移", 46315, "李", "张、赵", "两套账号", "统一认证", 46324, "已回答"],
  [2, null, "中", null, "2026/10/21", null, "张\n王", "见本表第1项", null, null, "处理中"],
  [3, null, null, null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null, null, null, null],
  [4, "体验优化", "低", null, null, null, null, "慢", null, "下周", "完了"],
  ["注：第1—2项为访谈整理，第4—4项为建议"],
];

describe("Excel 导入解析", () => {
  const r = parseMatrix(sheet);

  it("解析表头区", () => {
    expect(r.hasHeaderArea).toBe(true);
    expect(r.header.customer).toBe("测试客户甲");
    expect(r.header.meetingOn).toBe("2026-10-20");
    expect(r.header.updatedOn).toBe("2026-10-30");
    expect(r.header.updater).toBe("王");
    expect(r.header.filling).toBe("按客户原话记录");
  });

  it("跳过空行与仅有番号的占位行", () => {
    expect(r.rows.map((x) => x.seq)).toEqual([1, 2, 4]);
    expect(r.skipped).toBe(2);
  });

  it("序列日期、文本日期、詳細拆分", () => {
    const [a, b] = r.rows;
    expect(a.dueOn).toBe("2026-10-29");
    expect(a.recordedOn).toBe("2026-10-20");
    expect(a.problem).toBe("两套账号");
    expect(a.solution).toBe("统一认证");
    expect(b.recordedOn).toBe("2026-10-21");
    expect(r.dates).toEqual(["2026-10-20", "2026-10-21"]);
  });

  it("已回答保持已回答；完了不冒充已完成", () => {
    expect(r.rows[0].status).toBe("answered");
    expect(r.rows[2].status).toBe("pending_customer");
    expect(r.rows[2].warnings.join()).toContain("待客户确认");
  });

  it("缺标题、无法识别日期给警告；担当拆分；本表引用", () => {
    expect(r.rows[1].warnings.join()).toContain("标题待补");
    expect(r.rows[2].warnings.join()).toContain("无法识别的日期");
    expect(r.rows[0].assigneeNames).toEqual(["张", "赵"]);
    expect(r.rows[1].assigneeNames).toEqual(["张", "王"]);
    expect(r.rows[1].refs).toEqual([1]);
  });

  it("脚注预填确认类别", () => {
    expect(r.rows.map((x) => x.confirmationKind)).toEqual(["confirmed_requirement", "confirmed_requirement", "suggested_pending"]);
  });

  it("无表头行时报错", () => {
    expect(parseMatrix([["a", "b"]]).error).toBeTruthy();
  });

  it("辅助函数", () => {
    expect(mapStatus("").status).toBe("open");
    expect(mapStatus("奇怪").warning).toBeTruthy();
    expect(mapStatus("待客户确认").status).toBe("pending_customer");
    expect(mapStatus("未完成").status).toBe("open");
    expect(mapStatus("未完了").status).toBe("open");
    expect(mapStatus("尚未回答").status).toBe("open");
    expect(splitNames("a, b，a")).toEqual(["a", "b"]);
    expect(parseFootnote("第3~5项为建议").get(4)).toBe("suggested_pending");
  });
});
