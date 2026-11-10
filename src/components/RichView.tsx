"use client";

// 展示已消毒的富文本；点击图片放大
import { useState } from "react";

export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="lightbox" role="dialog" aria-label="图片预览" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()} tabIndex={-1}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="预览" />
    </div>
  );
}

export default function RichView({ html, empty = "—" }: { html: string; empty?: string }) {
  const [zoom, setZoom] = useState<string | null>(null);
  if (!html) return <span className="muted">{empty}</span>;
  return (
    <>
      <div
        className="rich"
        // html 由服务端组件 Rich 消毒后传入
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={(e) => {
          const t = e.target as HTMLElement;
          if (t.tagName === "IMG") setZoom((t as HTMLImageElement).src);
        }}
      />
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </>
  );
}
