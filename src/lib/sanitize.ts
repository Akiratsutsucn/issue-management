// 富文本消毒：只保留基础排版与站内图片
import sanitizeHtml from "sanitize-html";

const IMG_SRC_RE = /^\/api\/files\/rich\/[a-z0-9]+$/;

export function sanitizeRich(html: string): string {
  const clean = sanitizeHtml(html ?? "", {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "code", "pre", "h3", "h4", "a", "img"],
    allowedAttributes: { a: ["href", "rel", "target"], img: ["src", "alt"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: [] },
    allowProtocolRelative: false,
    exclusiveFilter: (frame) => frame.tag === "img" && !IMG_SRC_RE.test(frame.attribs.src ?? ""),
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: "noopener noreferrer", target: "_blank" } }),
    },
  });
  return isRichEmpty(clean) ? "" : clean;
}

/** 正文是否为空（无文字且无图片） */
export function isRichEmpty(html: string): boolean {
  if (!html) return true;
  if (/<img\b/i.test(html)) return false;
  return richToText(html).trim() === "";
}

/** 富文本 → 纯文本（导出、检索摘要用） */
export function richToText(html: string): string {
  if (!html) return "";
  const withBreaks = html
    .replace(/<img\b[^>]*>/gi, "[图片]")
    .replace(/<\/(p|li|h3|h4|blockquote|pre)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  return sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 纯文本 → 富文本（导入用） */
export function textToRich(text: string): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return t
    .split(/\r?\n/)
    .map((line) => `<p>${esc(line) || "<br>"}</p>`)
    .join("");
}

export function richImageIds(html: string): string[] {
  return [...html.matchAll(/\/api\/files\/rich\/([a-z0-9]+)/g)].map((m) => m[1]);
}
