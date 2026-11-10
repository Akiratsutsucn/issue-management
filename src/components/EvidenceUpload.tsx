"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AV_REJECT_MESSAGE, isAudioVideo } from "@/lib/file-rules";
import { EVIDENCE_LABEL } from "@/lib/labels";

export const EVIDENCE_ACCEPT = ".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt";

export default function EvidenceUpload({ issueId }: { issueId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState("config_screenshot");
  const [caption, setCaption] = useState("");
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    let okCount = 0;
    for (const f of files) {
      if (isAudioVideo(f.name, f.type)) {
        setMsg({ text: `${f.name}：${AV_REJECT_MESSAGE}`, err: true });
        continue;
      }
      const fd = new FormData();
      fd.append("file", f);
      fd.append("purpose", "evidence");
      fd.append("issueId", issueId);
      fd.append("type", type);
      fd.append("caption", caption);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) okCount++;
      else setMsg({ text: `${f.name}：${json.error ?? "上传失败"}`, err: true });
    }
    setBusy(false);
    if (okCount) {
      setCaption("");
      setMsg((m) => (m?.err ? m : { text: `已上传 ${okCount} 个文件`, err: false }));
      router.refresh();
    }
  };

  return (
    <div
      className="stack-sm"
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void upload([...e.dataTransfer.files]);
      }}
      style={{ border: `1px dashed ${drag ? "var(--primary)" : "var(--line-strong)"}`, borderRadius: 12, padding: 12 }}
    >
      <div className="row">
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: "auto", height: 30 }} aria-label="证据类型">
          {Object.entries(EVIDENCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="说明（可选）" style={{ flex: 1, minWidth: 140, height: 30 }} maxLength={300} />
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "上传中…" : "选择文件"}</button>
        <input ref={fileRef} type="file" hidden multiple accept={EVIDENCE_ACCEPT} onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </div>
      <span className="hint">可拖入。图片 jpg/png/gif/webp，文档 pdf/doc/docx/xls/xlsx/txt。不支持视频或语音。</span>
      {msg && <span className={`small ${msg.err ? "danger-text" : ""}`} role={msg.err ? "alert" : undefined}>{msg.text}</span>}
    </div>
  );
}
