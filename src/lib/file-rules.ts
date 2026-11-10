// 附件类型规则（纯函数）。拒绝音视频。
export const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp"] as const;
export const DOC_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "txt"] as const;
export const AV_EXT = [
  "mp4", "mov", "avi", "mkv", "webm", "wmv", "flv", "m4v", "3gp", "mpg", "mpeg",
  "mp3", "wav", "m4a", "aac", "ogg", "oga", "flac", "wma", "amr", "opus",
] as const;

export const AV_REJECT_MESSAGE = "本系统不支持视频或语音文件";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
};

export function extOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i < 0 ? "" : fileName.slice(i + 1).toLowerCase();
}

export function isAudioVideo(fileName: string, mime: string): boolean {
  const m = mime.toLowerCase();
  return m.startsWith("audio/") || m.startsWith("video/") || (AV_EXT as readonly string[]).includes(extOf(fileName));
}

/** 按文件头识别真实类型，防止改扩展名 */
export function sniffMime(head: Uint8Array): string | null {
  const b = head;
  const at = (i: number, ...bytes: number[]) => bytes.every((v, k) => b[i + k] === v);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  if (at(0, 0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (at(0, 0x50, 0x4b, 0x03, 0x04)) return "application/zip"; // docx/xlsx
  if (at(0, 0xd0, 0xcf, 0x11, 0xe0)) return "application/x-ole"; // doc/xls
  // 音视频常见文件头
  if (at(4, 0x66, 0x74, 0x79, 0x70)) return "video/mp4"; // ftyp: mp4/mov/m4a
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return "video/webm";
  if (at(0, 0x49, 0x44, 0x33) || at(0, 0xff, 0xfb)) return "audio/mpeg";
  if (at(0, 0x4f, 0x67, 0x67, 0x53)) return "audio/ogg";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && (at(8, 0x57, 0x41, 0x56, 0x45) || at(8, 0x41, 0x56, 0x49, 0x20))) return "audio/wav";
  return null;
}

export type FileCheck = { ok: true; mime: string; isImage: boolean } | { ok: false; error: string };

export interface CheckOptions {
  imagesOnly: boolean;
  maxImageBytes: number;
  maxAttachmentBytes: number;
}

export function checkFile(fileName: string, declaredMime: string, size: number, head: Uint8Array, opt: CheckOptions): FileCheck {
  const sniffed = sniffMime(head);
  if (isAudioVideo(fileName, declaredMime) || (sniffed && /^(audio|video)\//.test(sniffed))) {
    return { ok: false, error: AV_REJECT_MESSAGE };
  }
  const ext = extOf(fileName);
  const isImage = (IMAGE_EXT as readonly string[]).includes(ext);
  const isDoc = (DOC_EXT as readonly string[]).includes(ext);
  if (opt.imagesOnly && !isImage) return { ok: false, error: "正文只能插入 jpg / png / gif / webp 图片" };
  if (!isImage && !isDoc) return { ok: false, error: "不支持的文件类型" };
  if (size <= 0) return { ok: false, error: "文件为空" };

  const mime = MIME_BY_EXT[ext];
  if (isImage) {
    if (sniffed !== mime) return { ok: false, error: "图片内容与扩展名不符" };
    if (size > opt.maxImageBytes) return { ok: false, error: `图片超过 ${mb(opt.maxImageBytes)}` };
  } else {
    if (ext === "pdf" && sniffed !== "application/pdf") return { ok: false, error: "PDF 内容无效" };
    if ((ext === "docx" || ext === "xlsx") && sniffed !== "application/zip") return { ok: false, error: "文档内容与扩展名不符" };
    if ((ext === "doc" || ext === "xls") && sniffed !== "application/x-ole") return { ok: false, error: "文档内容与扩展名不符" };
    if (ext === "txt" && sniffed) return { ok: false, error: "文本文件内容无效" };
    if (size > opt.maxAttachmentBytes) return { ok: false, error: `文件超过 ${mb(opt.maxAttachmentBytes)}` };
  }
  return { ok: true, mime, isImage };
}

function mb(n: number): string {
  return `${Math.round(n / 1048576)}MB`;
}

export function isPreviewable(mime: string): boolean {
  return mime.startsWith("image/") || mime === "application/pdf";
}
