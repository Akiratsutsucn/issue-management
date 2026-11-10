// 鉴权后读取正文图片或证据文件，不暴露存储目录
import { NextResponse } from "next/server";
import { isPreviewable } from "@/lib/file-rules";
import { apiUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { storage } from "@/lib/server/storage";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { kind, id } = await ctx.params;

  const rec =
    kind === "rich"
      ? await prisma.richImage.findUnique({ where: { id } })
      : kind === "evidence"
        ? await prisma.evidence.findUnique({ where: { id } })
        : null;
  if (!rec) return NextResponse.json({ error: "文件不存在" }, { status: 404 });

  let data: Buffer;
  try {
    data = await storage().get(rec.storageKey);
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
  const download = new URL(req.url).searchParams.get("download") === "1" || !isPreviewable(rec.mime);
  const encoded = encodeURIComponent(rec.fileName);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": rec.mime,
      "Content-Length": String(data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encoded}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
