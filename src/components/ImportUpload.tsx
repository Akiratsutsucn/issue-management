"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ImportUpload({ customerId, projectId }: { customerId: string; projectId: string }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="stack-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr("");
        setBusy(true);
        const res = await fetch("/api/import", { method: "POST", body: new FormData(e.currentTarget) });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
        setBusy(false);
        if (!res.ok || !json.ok) return setErr(json.error ?? "解析失败");
        const q = new URLSearchParams({ job: json.id ?? "" });
        if (customerId) q.set("customer", customerId);
        if (projectId) q.set("project", projectId);
        router.push(`/import?${q}`);
      }}
    >
      <input type="file" name="file" accept=".xlsx" required />
      <input type="text" name="sheet" placeholder="工作表名（可选，默认「課題管理」或第一张）" maxLength={100} style={{ maxWidth: 360 }} />
      {err && <div className="error-box" role="alert">{err}</div>}
      <div className="row"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "解析中…" : "上传并预览"}</button></div>
    </form>
  );
}
