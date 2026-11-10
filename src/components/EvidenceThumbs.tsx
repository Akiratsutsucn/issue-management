"use client";

import { useState } from "react";
import { extOf } from "@/lib/file-rules";
import { Lightbox } from "./RichView";

export interface EvidenceItem {
  id: string;
  fileName: string;
  mime: string;
  caption: string;
  typeLabel: string;
  hidden: boolean;
  meta: string;
}

export default function EvidenceThumbs({ items }: { items: EvidenceItem[] }) {
  const [zoom, setZoom] = useState<string | null>(null);
  if (!items.length) return <span className="muted small">暂无证据</span>;
  return (
    <>
      <div className="thumbs">
        {items.map((e) => {
          const url = `/api/files/evidence/${e.id}`;
          return (
            <div key={e.id} className={`thumb${e.hidden ? " hidden-ev" : ""}`} title={`${e.fileName}\n${e.meta}`}>
              {e.mime.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={e.caption || e.fileName} loading="lazy" onClick={() => setZoom(url)} />
              ) : (
                <a className="file-ico" href={url} target="_blank" rel="noopener noreferrer">{extOf(e.fileName).toUpperCase()}</a>
              )}
              <div className="cap">
                {e.hidden ? "已隐藏 · " : ""}
                {e.typeLabel}
                {e.caption ? ` · ${e.caption}` : ""}
              </div>
              <div className="cap" style={{ paddingTop: 0 }}>
                <a href={`${url}?download=1`} className="muted">下载</a>
              </div>
            </div>
          );
        })}
      </div>
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </>
  );
}
