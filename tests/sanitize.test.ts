import { describe, expect, it } from "vitest";
import { isRichEmpty, richToText, sanitizeRich, textToRich } from "@/lib/sanitize";

describe("富文本消毒", () => {
  it("去除脚本与事件属性", () => {
    const out = sanitizeRich('<p onclick="x()">a<script>alert(1)</script></p><iframe src="x"></iframe>');
    expect(out).toBe("<p>a</p>");
  });

  it("只保留站内图片", () => {
    expect(sanitizeRich('<p><img src="/api/files/rich/abc123"></p>')).toContain('src="/api/files/rich/abc123"');
    expect(sanitizeRich('<p>x<img src="https://evil/x.png"><img src="data:image/png;base64,AA"></p>')).toBe("<p>x</p>");
  });

  it("禁止 javascript 链接，外链加 noopener", () => {
    expect(sanitizeRich('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript");
    expect(sanitizeRich('<a href="https://a.com">x</a>')).toContain('rel="noopener noreferrer"');
  });

  it("视频/音频标签被去除", () => {
    expect(sanitizeRich('<p>a</p><video src="x"></video><audio src="y"></audio>')).toBe("<p>a</p>");
  });

  it("空正文判定与互转", () => {
    expect(isRichEmpty("<p><br></p>")).toBe(true);
    expect(sanitizeRich("<p> </p>")).toBe("");
    expect(isRichEmpty('<p><img src="/api/files/rich/a1"></p>')).toBe(false);
    expect(richToText("<p>第一行</p><p>a &amp; b</p>")).toBe("第一行\na & b");
    expect(textToRich("a<b\nc")).toBe("<p>a&lt;b</p><p>c</p>");
  });
});
