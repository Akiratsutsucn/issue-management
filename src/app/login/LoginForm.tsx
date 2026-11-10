"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { error: "" });
  return (
    <form action={action} className="stack">
      <label className="field">
        <span>邮箱</span>
        <input type="email" name="email" autoComplete="username" required autoFocus />
      </label>
      <label className="field">
        <span>密码</span>
        <input type="password" name="password" autoComplete="current-password" required />
      </label>
      {state.error && <div className="error-box" role="alert">{state.error}</div>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "登录中…" : "登录"}
      </button>
    </form>
  );
}
