import { describe, expect, it } from "vitest";
import { canTransition, checkTransition, completionGate, type GateInput } from "@/lib/status";

const fullGate: GateInput = { visibleEvidenceCount: 1, confirmName: "张经理", confirmedAt: "2026-11-10" };
const emptyGate: GateInput = { visibleEvidenceCount: 0, confirmName: "", confirmedAt: null };

describe("状态机", () => {
  it("已回答不能直接变为已完成", () => {
    expect(canTransition("answered", "done")).toBe(false);
    const r = checkTransition({ from: "answered", to: "done", reason: "", gate: fullGate, exceptional: false, isAdmin: true });
    expect(r.ok).toBe(false);
  });

  it("待处理可到处理中、已回答、已关闭", () => {
    expect(canTransition("open", "in_progress")).toBe(true);
    expect(canTransition("open", "answered")).toBe(true);
    expect(canTransition("open", "closed")).toBe(true);
    expect(canTransition("open", "done")).toBe(false);
  });

  it("关闭与重开须理由", () => {
    expect(checkTransition({ from: "open", to: "closed", reason: " ", gate: emptyGate, exceptional: false, isAdmin: false }).ok).toBe(false);
    expect(checkTransition({ from: "done", to: "in_progress", reason: "", gate: emptyGate, exceptional: false, isAdmin: false }).ok).toBe(false);
    expect(checkTransition({ from: "closed", to: "in_progress", reason: "客户重新提出", gate: emptyGate, exceptional: false, isAdmin: false }).ok).toBe(true);
  });

  it("无证据不能普通完成，并列出缺项", () => {
    const r = checkTransition({ from: "pending_customer", to: "done", reason: "", gate: emptyGate, exceptional: false, isAdmin: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(["至少一份证据", "客户确认人", "客户确认时间"]);
  });

  it("证据与客户确认齐全可完成", () => {
    const r = checkTransition({ from: "pending_customer", to: "done", reason: "", gate: fullGate, exceptional: false, isAdmin: false });
    expect(r).toEqual({ ok: true, exceptional: false });
  });

  it("例外完成：仅管理员、须理由、只能跳过一项", () => {
    const noEvidence = { ...fullGate, visibleEvidenceCount: 0 };
    expect(checkTransition({ from: "pending_customer", to: "done", reason: "现场确认", gate: noEvidence, exceptional: true, isAdmin: false }).ok).toBe(false);
    expect(checkTransition({ from: "pending_customer", to: "done", reason: "", gate: noEvidence, exceptional: true, isAdmin: true }).ok).toBe(false);
    expect(checkTransition({ from: "pending_customer", to: "done", reason: "现场确认", gate: noEvidence, exceptional: true, isAdmin: true })).toEqual({ ok: true, exceptional: true });
    expect(checkTransition({ from: "pending_customer", to: "done", reason: "x", gate: emptyGate, exceptional: true, isAdmin: true }).ok).toBe(false);
  });

  it("completionGate 确认人空白视为缺失", () => {
    expect(completionGate({ visibleEvidenceCount: 2, confirmName: "  ", confirmedAt: "2026-01-01" }).missing).toEqual(["客户确认人"]);
  });
});
