"use client";

import { useActionState, useState } from "react";
import { bulkAction, type FormState } from "@/app/(app)/issues/actions";
import { STATUS_LABEL, type IssueStatus } from "@/lib/status";

const TARGETS: IssueStatus[] = ["open", "in_progress", "answered", "pending_customer", "closed"];

export default function BulkBar({ users }: { users: { id: string; displayName: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(bulkAction, { error: "" });
  const [op, setOp] = useState("status");
  return (
    <form id="bulk-form" action={action} className="bulk">
      <span>勾选后批量：</span>
      <select name="op" value={op} onChange={(e) => setOp(e.target.value)} style={{ width: "auto", height: 30 }}>
        <option value="status">改状态</option>
        <option value="assignee">追加担当</option>
      </select>
      {op === "status" ? (
        <>
          <select name="to" style={{ width: "auto", height: 30 }} defaultValue="in_progress">
            {TARGETS.map((t) => <option key={t} value={t}>{STATUS_LABEL[t]}</option>)}
          </select>
          <input type="text" name="reason" placeholder="理由（关闭/重开时必填）" style={{ width: 220, height: 30 }} />
        </>
      ) : (
        <select name="userId" style={{ width: "auto", height: 30 }}>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
        </select>
      )}
      <button className="btn btn-sm" type="submit" disabled={pending}>应用</button>
      {state.error && <span className="danger-text small">{state.error}</span>}
      {state.ok && <span className="small" style={{ color: "var(--sage-text)" }}>{state.ok}</span>}
    </form>
  );
}
