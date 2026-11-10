// 上传：正文图片（purpose=rich）或证据（purpose=evidence）。服务端二次校验类型与大小，拒绝音视频。
import { NextResponse } from "next/server";
import { checkFile } from "@/lib/file-rules";
import { EVIDENCE_TYPES } from "@/lib/validation";
import { apiUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { evidenceUploaded } from "@/lib/server/issue-ops";
import { getSettings } from "@/lib/server/settings";
import { makeKey, storage } from "@/lib/server/storage";

export const runtime = "nodejs";

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return fail("未登录", 401);

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return fail("上传内容无效");
  }
  const file = fd.get("file");
  const purpose = String(fd.get("purpose") ?? "");
  if (!(file instanceof File)) return fail("未选择文件");
  if (purpose !== "rich" && purpose !== "evidence") return fail("用途无效");

  const settings = await getSettings();
  const buf = Buffer.from(await file.arrayBuffer());
  const check = checkFile(file.name, file.type, buf.length, new Uint8Array(buf.subarray(0, 16)), {
    imagesOnly: purpose === "rich",
    maxImageBytes: settings.maxImageBytes,
    maxAttachmentBytes: settings.maxAttachmentBytes,
  });
  if (!check.ok) return fail(check.error, 415);

  try {
    if (purpose === "rich") {
      const storageKey = makeKey(`rich/${new Date().toISOString().slice(0, 7)}`, file.name);
      await storage().put(storageKey, buf);
      const img = await prisma.richImage.create({
        data: { storageKey, mime: check.mime, size: buf.length, fileName: file.name.slice(0, 200), uploadedById: user.id },
      });
      return NextResponse.json({ ok: true, url: `/api/files/rich/${img.id}` });
    }

    const issueId = String(fd.get("issueId") ?? "");
    const typeRaw = String(fd.get("type") ?? "other");
    const type = (EVIDENCE_TYPES as readonly string[]).includes(typeRaw) ? (typeRaw as (typeof EVIDENCE_TYPES)[number]) : "other";
    const caption = String(fd.get("caption") ?? "").slice(0, 300);
    const issue = await prisma.issue.findUnique({ where: { id: issueId }, select: { id: true, customerId: true } });
    if (!issue) return fail("课题不存在", 404);
    const storageKey = makeKey(`customers/${issue.customerId}/issues/${issue.id}`, file.name);
    await storage().put(storageKey, buf);
    const ev = await prisma.evidence.create({
      data: { issueId, type, caption, fileName: file.name.slice(0, 200), mime: check.mime, size: buf.length, storageKey, uploadedById: user.id },
    });
    await evidenceUploaded(issueId, ev.fileName, type, user.id);
    return NextResponse.json({ ok: true, id: ev.id });
  } catch (e) {
    console.error("[upload] failed:", e instanceof Error ? e.message : e);
    return fail("保存文件失败", 500);
  }
}
