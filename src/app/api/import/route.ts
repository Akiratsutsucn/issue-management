// 导入第 1 步：上传 xlsx，解析并生成预览任务
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { buildPreview } from "@/lib/server/importer";
import { getSettings } from "@/lib/server/settings";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "未选择文件" }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ ok: false, error: "只支持 .xlsx 工作簿" }, { status: 415 });
  const settings = await getSettings();
  if (file.size > settings.maxAttachmentBytes) return NextResponse.json({ ok: false, error: "文件过大" }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) return NextResponse.json({ ok: false, error: "文件不是有效的 xlsx" }, { status: 415 });
  try {
    const preview = await buildPreview(buf, String(fd?.get("sheet") ?? "") || undefined);
    if (preview.error) return NextResponse.json({ ok: false, error: preview.error }, { status: 422 });
    const job = await prisma.importJob.create({
      data: { fileName: file.name.slice(0, 200), preview: preview as unknown as Prisma.InputJsonValue, createdById: user.id },
    });
    return NextResponse.json({ ok: true, id: job.id });
  } catch (e) {
    console.error("[import] parse failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "无法读取该工作簿" }, { status: 422 });
  }
}
