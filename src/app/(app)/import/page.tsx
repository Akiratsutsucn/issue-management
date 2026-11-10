import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import ImportUpload from "@/components/ImportUpload";
import { CONFIRM_SHORT } from "@/lib/labels";
import { STATUS_LABEL } from "@/lib/status";
import { prisma } from "@/lib/server/db";
import type { ImportReport, PreviewData } from "@/lib/server/importer";
import { param, type SearchParams } from "@/lib/server/issue-query";
import { executeImportAction } from "./actions";

const STEPS = ["上传", "预览", "确认", "结果"];
function Steps({ on }: { on: number }) {
  return <div className="steps">{STEPS.map((s, i) => <div key={s} className={`step${i === on ? " on" : ""}`}>{i + 1}. {s}</div>)}</div>;
}

export default async function ImportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const jobId = param(sp, "job");
  const job = jobId ? await prisma.importJob.findUnique({ where: { id: jobId } }) : null;

  if (!job) {
    const recent = await prisma.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
    return (
      <main className="page stack" style={{ maxWidth: 1000 }}>
        <div className="page-head"><div><h1>导入 Excel（可选）</h1><div className="sub">不是必经步骤。系统不会自动导入任何文件。</div></div></div>
        <Steps on={0} />
        <section className="card stack-sm">
          <ImportUpload customerId={param(sp, "customer")} />
          <p className="hint">支持表头区（客先、会谈、更新日、更新者、会谈信息、填写口径）、「詳細」拆分为問題点/解決案、Excel 序列日期与缺字段行。上传后先预览，确认后才写入。</p>
        </section>
        {recent.length > 0 && (
          <section className="card">
            <h2 style={{ marginBottom: 8 }}>最近导入</h2>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {recent.map((j) => <li key={j.id}><Link href={`/import?job=${j.id}`}>{j.fileName}</Link> <span className="small muted">· {j.status === "done" ? "已执行" : "待确认"}</span></li>)}
            </ul>
          </section>
        )}
      </main>
    );
  }

  const pv = job.preview as unknown as PreviewData;
  if (job.status === "done") {
    const r = job.report as unknown as ImportReport;
    return (
      <main className="page stack" style={{ maxWidth: 1000 }}>
        <div className="page-head"><div><h1>导入结果</h1><div className="sub">{job.fileName}</div></div><Link className="btn btn-primary" href={`/issues?customer=${r.customerId}&status=all`}>查看课题</Link></div>
        <Steps on={3} />
        <section className="card">
          <p>创建 <b className="num">{r.created}</b> · 更新 <b className="num">{r.updated}</b> · 跳过 <b className="num">{r.skipped}</b> · 失败 <b className="num">{r.failed.length}</b> · 建立关联 <b className="num">{r.linked}</b></p>
        </section>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>源行</th><th>结果</th></tr></thead>
            <tbody>
              {r.rows.map((x) => <tr key={x.rowNo}><td className="num">{x.rowNo}</td><td>{x.issueId ? <Link href={`/issues/${x.issueId}`}>{x.result}</Link> : x.result}</td></tr>)}
              {r.failed.map((x) => <tr key={`f${x.rowNo}`}><td className="num">{x.rowNo}</td><td className="danger-text">失败：{x.reason}</td></tr>)}
            </tbody>
          </table>
        </div>
      </main>
    );
  }

  const customers = await prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const target = param(sp, "customer") || pv.matchedCustomerId || "";
  const unmatchedUsers = Object.entries(pv.userMatch).filter(([, v]) => !v).map(([k]) => k);
  const unmatchedPriorities = Object.entries(pv.priorityMatch).filter(([k, v]) => k && !v).map(([k]) => k);
  const multiDay = pv.dates.length > 1;

  return (
    <main className="page page-wide stack" style={{ maxWidth: 1500 }}>
      <div className="page-head"><div><h1>导入预览</h1><div className="sub">{job.fileName} · 工作表「{pv.sheet}」· {pv.rows.length} 行可导入，跳过空行 {pv.skipped}</div></div><Link className="btn btn-text" href="/import">重新上传</Link></div>
      <Steps on={1} />

      <ActionForm action={executeImportAction.bind(null, job.id)} submitLabel="确认导入" submitClass="btn btn-primary" confirmText="确认按以上设置写入？" className="stack">
        <section className="card stack-sm">
          <h2>表头区</h2>
          {pv.hasHeaderArea ? (
            <p className="small">客先「{pv.header.customer || "—"}」· 会谈「{pv.header.meeting || "—"}」（{pv.header.meetingOn ?? "日期未识别"}）· 更新日 {pv.header.updatedOn ?? "—"} · 更新者 {pv.header.updater || "—"}</p>
          ) : <p className="small muted">未识别到表头区，请指定目标客户。</p>}
          <div className="form-grid">
            <label className="field span-2"><span>目标客户</span>
              <select name="customerId" defaultValue={target}>
                <option value="">新建客户（填右侧名称）</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="field span-2"><span>新客户名称</span><input type="text" name="newCustomerName" defaultValue={pv.matchedCustomerId ? "" : pv.header.customer} maxLength={120} /></label>
            <label className="field span-2"><span>批次归属</span>
              <select name="batchMode" defaultValue={multiDay ? "byDate" : "header"}>
                <option value="byDate">按记载日：与会谈日不同的日期各建「跟进」批次</option>
                <option value="header">全部归入表头会谈</option>
                <option value="none">不建批次</option>
              </select>
            </label>
            <label className="field span-2"><span>番号已存在时</span>
              <select name="strategy" defaultValue="fill_blanks">
                <option value="fill_blanks">仅填空，問題点/解決案追加</option>
                <option value="skip_existing">跳过</option>
                <option value="overwrite_scalars">覆盖标量，問題点/解決案仍只追加</option>
              </select>
            </label>
            <label className="check span-4"><input type="checkbox" name="fillRecorded" />缺记载日时用会谈日回填</label>
          </div>
          {multiDay && <div className="warn-box">记载日跨 {pv.dates.length} 天（{pv.dates.join("、")}）。默认按日期分出跟进批次，可改为全部归入表头会谈。</div>}
          {unmatchedUsers.length > 0 && <div className="warn-box">未匹配到内部用户的担当：{unmatchedUsers.join("、")}。原文会保留在「担当原文」，可在设置中为用户添加别名后重新上传。</div>}
          {unmatchedPriorities.length > 0 && <div className="warn-box">未识别的优先度：{unmatchedPriorities.join("、")}，按「中」导入。</div>}
          {pv.footnote && <p className="small muted" style={{ whiteSpace: "pre-wrap" }}>脚注：{pv.footnote}</p>}
          <p className="hint">源表「已完成/完了」一律导入为「待客户确认」，补齐证据与客户确认后再完成。「已回答」保持已回答。</p>
        </section>

        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>跳过</th><th>源行</th><th>番号</th><th>标题</th><th>優先度</th><th>記載日</th><th>期限</th><th>担当</th><th>状態</th><th>確認</th><th>问题点 / 解决案</th><th>说明</th></tr></thead>
            <tbody>
              {pv.rows.map((r) => (
                <tr key={r.rowNo}>
                  <td><input type="checkbox" name="skip" value={r.rowNo} aria-label={`跳过第 ${r.rowNo} 行`} /></td>
                  <td className="num">{r.rowNo}</td>
                  <td className="num">{r.seq ?? "自动"}</td>
                  <td>{r.title || <span className="tag tag-draft">标题待补</span>}</td>
                  <td>{r.priorityText || "—"}</td>
                  <td className="num nowrap">{r.recordedOn ?? "—"}</td>
                  <td className="num nowrap">{r.dueOn ?? "—"}</td>
                  <td>{r.assigneeNames.map((n) => <span key={n} className={`tag ${pv.userMatch[n] ? "tag-sage" : ""}`} style={{ marginRight: 4 }}>{n}</span>)}{!r.assigneeNames.length && "—"}</td>
                  <td className="nowrap">{STATUS_LABEL[r.status]}{r.statusText && r.statusText !== STATUS_LABEL[r.status] && <div className="small muted">源：{r.statusText}</div>}</td>
                  <td>
                    <select name={`kind_${r.rowNo}`} defaultValue={r.confirmationKind} style={{ height: 28, fontSize: 12.5, width: "auto" }}>
                      {Object.entries(CONFIRM_SHORT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                  <td><span className="clip small">{r.problem || "—"}</span><span className="clip small muted">{r.solution || "—"}</span></td>
                  <td className="small">
                    {r.notes.map((n) => <div key={n} className="muted">{n}</div>)}
                    {r.warnings.map((w) => <div key={w} style={{ color: "var(--apricot-text)" }}>{w}</div>)}
                    {r.refs.length > 0 && <div className="muted">建议关联 #{r.refs.join("、#")}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ActionForm>
    </main>
  );
}
