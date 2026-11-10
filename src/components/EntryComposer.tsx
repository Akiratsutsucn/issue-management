"use client";

import { useActionState, useEffect, useState } from "react";
import type { FormState } from "@/app/(app)/issues/actions";
import RichEditor from "./RichEditor";

interface Props {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  kind: "problem" | "solution";
  answered: boolean;
}

export default function EntryComposer({ action, kind, answered }: Props) {
  const [state, run, pending] = useActionState(action, { error: "" });
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (state.ok) {
      setKey((k) => k + 1);
      setOpen(false);
    }
  }, [state]);
  const label = kind === "problem" ? "追加问题" : "追加解决";
  if (!open) {
    return (
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>{label}</button>
        {state.ok && <span className="small" style={{ color: "var(--sage-text)" }}>{state.ok}</span>}
      </div>
    );
  }
  return (
    <form action={run} className="stack-sm">
      <input type="hidden" name="kind" value={kind} />
      <RichEditor key={key} name="body" placeholder={kind === "problem" ? "新的追问或补充，可粘贴截图" : "新的回答或方案，可粘贴截图"} />
      {kind === "problem" && answered && (
        <label className="check small">
          <input type="checkbox" name="reopen" defaultChecked />
          当前为「已回答」，追加后改回「处理中」
        </label>
      )}
      {state.error && <div className="error-box" role="alert">{state.error}</div>}
      <div className="row">
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>{pending ? "提交中…" : label}</button>
        <button className="btn btn-text btn-sm" type="button" onClick={() => setOpen(false)}>取消</button>
      </div>
    </form>
  );
}
