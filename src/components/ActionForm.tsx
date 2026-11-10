"use client";

// 通用表单外壳：提交 server action，显示错误/成功与缺失项
import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/(app)/issues/actions";

interface Props {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submitLabel: string;
  submitClass?: string;
  confirmText?: string;
  resetOnOk?: boolean;
  className?: string;
}

export default function ActionForm({ action, children, submitLabel, submitClass = "btn", confirmText, resetOnOk, className }: Props) {
  const [state, run, pending] = useActionState(action, { error: "" });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnOk) ref.current?.reset();
  }, [state, resetOnOk]);
  return (
    <form
      ref={ref}
      action={run}
      className={className ?? "stack-sm"}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
      {state.error && (
        <div className="error-box" role="alert">
          {state.error}
          {state.missing?.length ? <>：缺少 {state.missing.join("、")}</> : null}
        </div>
      )}
      {state.ok && <div className="ok-box">{state.ok}</div>}
      <div className="row">
        <button className={submitClass} type="submit" disabled={pending}>{pending ? "处理中…" : submitLabel}</button>
      </div>
    </form>
  );
}
