"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/(app)/issues/actions";
import { STATUS_LABEL, requiresReason, type IssueStatus } from "@/lib/status";

interface Props {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  current: IssueStatus;
  targets: IssueStatus[];
  isAdmin: boolean;
  hasSolution: boolean;
  hasCompletionCondition: boolean;
}

export default function StatusForm({ action, current, targets, isAdmin, hasSolution, hasCompletionCondition }: Props) {
  const [state, run, pending] = useActionState(action, { error: "" });
  const [to, setTo] = useState<IssueStatus>(targets[0]);
  const [exceptional, setExceptional] = useState(false);
  if (!targets.length) return null;
  const needReason = requiresReason(current, to) || (to === "done" && exceptional);

  return (
    <form
      action={run}
      className="stack-sm"
      onSubmit={(e) => {
        if (to === "closed" && !window.confirm("关闭不是完成。确定关闭该课题？")) e.preventDefault();
        if (exceptional && to === "done" && !window.confirm("例外完成会在日志中标记为例外。确定继续？")) e.preventDefault();
      }}
    >
      <div className="row">
        <select name="to" value={to} onChange={(e) => setTo(e.target.value as IssueStatus)} style={{ width: "auto" }} aria-label="目标状态">
          {targets.map((t) => <option key={t} value={t}>改为「{STATUS_LABEL[t]}」</option>)}
        </select>
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>{pending ? "处理中…" : "确定"}</button>
      </div>
      {to === "answered" && !hasSolution && <div className="warn-box">还没有解决案，仍可改为已回答。</div>}
      {to === "done" && !hasCompletionCondition && <div className="warn-box">完了条件为空，建议先补充。</div>}
      {needReason && <input type="text" name="reason" placeholder={exceptional ? "例外完成理由（必填）" : "理由（必填）"} required maxLength={1000} />}
      {to === "done" && isAdmin && (
        <label className="check small muted">
          <input type="checkbox" name="exceptional" checked={exceptional} onChange={(e) => setExceptional(e.target.checked)} />
          管理员例外完成（可跳过证据或客户确认之一，须填理由）
        </label>
      )}
      {state.error && (
        <div className="error-box" role="alert">
          {state.error}
          {state.missing?.length ? (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {state.missing.map((m) => <li key={m}>缺少{m}</li>)}
            </ul>
          ) : null}
        </div>
      )}
      {state.ok && <div className="ok-box">{state.ok}</div>}
    </form>
  );
}
