"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/app/(app)/issues/actions";
import { requireUser } from "@/lib/server/auth";
import { executeImport } from "@/lib/server/importer";

export async function executeImportAction(jobId: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const s = (k: string) => String(fd.get(k) ?? "");
  const strategy = s("strategy");
  const batchMode = s("batchMode");
  const kinds: Record<number, "confirmed_requirement" | "suggested_pending"> = {};
  for (const [k, v] of fd.entries()) {
    const m = k.match(/^kind_(\d+)$/);
    if (m) kinds[Number(m[1])] = v === "confirmed_requirement" ? "confirmed_requirement" : "suggested_pending";
  }
  try {
    await executeImport(
      jobId,
      {
        customerId: s("customerId") || null,
        newCustomerName: s("newCustomerName").slice(0, 120),
        batchMode: batchMode === "header" || batchMode === "none" ? batchMode : "byDate",
        strategy: strategy === "skip_existing" || strategy === "overwrite_scalars" ? strategy : "fill_blanks",
        fillRecordedFromMeeting: fd.get("fillRecorded") === "on",
        skipRows: fd.getAll("skip").map(Number).filter(Number.isInteger),
        kinds,
      },
      user,
    );
  } catch (e) {
    console.error("[import] execute failed:", e instanceof Error ? e.message : e);
    return { error: e instanceof Error && /请|不存在|已执行/.test(e.message) ? e.message : "导入失败，未写入任何数据" };
  }
  revalidatePath("/", "layout");
  redirect(`/import?job=${jobId}`);
}
