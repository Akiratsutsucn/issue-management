// 状态机与完成门禁（纯函数，便于测试）
export type IssueStatus = "open" | "in_progress" | "answered" | "pending_customer" | "done" | "closed";

export const STATUS_LABEL: Record<IssueStatus, string> = {
  open: "待处理",
  in_progress: "处理中",
  answered: "已回答",
  pending_customer: "待客户确认",
  done: "已完成",
  closed: "已关闭",
};

export const STATUS_COLOR: Record<IssueStatus, string> = {
  open: "#A3A3A3",
  in_progress: "#7BA3D0",
  answered: "#8B9BCF",
  pending_customer: "#E0A37A",
  done: "#6DAF8B",
  closed: "#B4AFA8",
};

export const STATUS_ORDER: IssueStatus[] = ["open", "in_progress", "answered", "pending_customer", "done", "closed"];
export const UNFINISHED: IssueStatus[] = ["open", "in_progress", "answered", "pending_customer"];

const TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  open: ["in_progress", "answered", "closed"],
  in_progress: ["answered", "open", "closed"],
  answered: ["in_progress", "pending_customer", "closed"],
  pending_customer: ["done", "in_progress", "answered", "closed"],
  done: ["in_progress"],
  closed: ["in_progress"],
};

export function allowedTargets(from: IssueStatus): IssueStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: IssueStatus, to: IssueStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** 关闭与重开须理由 */
export function requiresReason(from: IssueStatus, to: IssueStatus): boolean {
  return to === "closed" || from === "done" || from === "closed";
}

export interface GateInput {
  visibleEvidenceCount: number;
  confirmName: string;
  confirmedAt: string | null;
}

export interface GateResult {
  ok: boolean;
  missing: string[];
}

/** 普通完成门禁：至少一份未隐藏证据 + 客户确认人与确认时间 */
export function completionGate(input: GateInput): GateResult {
  const missing: string[] = [];
  if (input.visibleEvidenceCount < 1) missing.push("至少一份证据");
  if (!input.confirmName.trim()) missing.push("客户确认人");
  if (!input.confirmedAt) missing.push("客户确认时间");
  return { ok: missing.length === 0, missing };
}

export interface TransitionRequest {
  from: IssueStatus;
  to: IssueStatus;
  reason: string;
  gate: GateInput;
  exceptional: boolean;
  isAdmin: boolean;
}

export type TransitionCheck = { ok: true; exceptional: boolean } | { ok: false; error: string; missing?: string[] };

export function checkTransition(req: TransitionRequest): TransitionCheck {
  if (!canTransition(req.from, req.to)) {
    return { ok: false, error: `不能从「${STATUS_LABEL[req.from]}」变为「${STATUS_LABEL[req.to]}」` };
  }
  if (requiresReason(req.from, req.to) && !req.reason.trim()) {
    return { ok: false, error: "此变更须填写理由" };
  }
  if (req.to !== "done") return { ok: true, exceptional: false };

  const gate = completionGate(req.gate);
  if (gate.ok) return { ok: true, exceptional: false };
  if (!req.exceptional) return { ok: false, error: "未满足完成条件", missing: gate.missing };
  if (!req.isAdmin) return { ok: false, error: "仅管理员可例外完成" };
  if (!req.reason.trim()) return { ok: false, error: "例外完成须填写理由" };
  // 例外完成只能跳过证据或客户确认之一
  const skipsEvidence = req.gate.visibleEvidenceCount < 1;
  const skipsConfirm = !req.gate.confirmName.trim() || !req.gate.confirmedAt;
  if (skipsEvidence && skipsConfirm) {
    return { ok: false, error: "例外完成只能跳过证据或客户确认其中一项", missing: gate.missing };
  }
  return { ok: true, exceptional: true };
}
