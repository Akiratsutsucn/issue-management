import { describe, expect, it } from "vitest";
import { AV_REJECT_MESSAGE, checkFile, isAudioVideo, sniffMime } from "@/lib/file-rules";

const opt = { imagesOnly: false, maxImageBytes: 10 * 1048576, maxAttachmentBytes: 20 * 1048576 };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0, 0, 0, 0, 0, 0]);
const MP4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const TXT = new TextEncoder().encode("hello world!");

describe("附件规则", () => {
  it("按扩展名与 MIME 拒绝音视频", () => {
    for (const f of ["a.mp4", "a.MOV", "a.avi", "a.mkv", "a.webm", "a.mp3", "a.wav", "a.m4a", "a.aac", "a.ogg"]) {
      expect(isAudioVideo(f, "")).toBe(true);
      const r = checkFile(f, "", 100, PNG, opt);
      expect(r).toEqual({ ok: false, error: AV_REJECT_MESSAGE });
    }
    expect(isAudioVideo("x.bin", "video/quicktime")).toBe(true);
  });

  it("改扩展名的视频按文件头拒绝", () => {
    expect(sniffMime(MP4)).toBe("video/mp4");
    expect(checkFile("fake.png", "image/png", 100, MP4, opt)).toEqual({ ok: false, error: AV_REJECT_MESSAGE });
  });

  it("接受合法图片与文档", () => {
    expect(checkFile("a.png", "image/png", 100, PNG, opt)).toEqual({ ok: true, mime: "image/png", isImage: true });
    expect(checkFile("a.JPG", "image/jpeg", 100, JPG, opt)).toMatchObject({ ok: true, mime: "image/jpeg" });
    expect(checkFile("a.pdf", "application/pdf", 100, PDF, opt)).toMatchObject({ ok: true, isImage: false });
    expect(checkFile("a.txt", "text/plain", 12, TXT, opt)).toMatchObject({ ok: true });
  });

  it("正文仅允许图片", () => {
    expect(checkFile("a.pdf", "application/pdf", 100, PDF, { ...opt, imagesOnly: true }).ok).toBe(false);
  });

  it("大小上限", () => {
    expect(checkFile("a.png", "image/png", 11 * 1048576, PNG, opt)).toEqual({ ok: false, error: "图片超过 10MB" });
    expect(checkFile("a.pdf", "application/pdf", 21 * 1048576, PDF, opt)).toEqual({ ok: false, error: "文件超过 20MB" });
  });

  it("内容与扩展名不符拒绝；未知类型拒绝", () => {
    expect(checkFile("a.png", "image/png", 100, PDF, opt).ok).toBe(false);
    expect(checkFile("a.exe", "", 100, TXT, opt).ok).toBe(false);
    expect(checkFile("a.png", "image/png", 0, PNG, opt).ok).toBe(false);
  });
});
