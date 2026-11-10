import { requireUser } from "@/lib/server/auth";
import Link from "next/link";
import EvidenceThumbs from "@/components/EvidenceThumbs";
import { TitleText } from "@/components/Pills";
import { fmtDateTime, isYmd } from "@/lib/dates";
import { EVIDENCE_LABEL } from "@/lib/labels";
import { prisma } from "@/lib/server/db";
import { param, type SearchParams } from "@/lib/server/issue-query";

export default async function EvidencePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireUser();
  const sp = await searchParams;
  const customer = param(sp, "customer");
  const type = param(sp, "type");
  const from = param(sp, "from");
  const to = param(sp, "to");
  const showHidden = param(sp, "hidden") === "1";
  const at = (ymd: string, end: boolean) => new Date(`${ymd}T${end ? "23:59:59.999" : "00:00:00"}+08:00`);

  const [rows, customers] = await Promise.all([
    prisma.evidence.findMany({
      where: {
        ...(showHidden ? {} : { hiddenAt: null }),
        ...(customer && { issue: { customerId: customer } }),
        ...(type && type in EVIDENCE_LABEL && { type: type as keyof typeof EVIDENCE_LABEL }),
        ...((isYmd(from) || isYmd(to)) && { createdAt: { ...(isYmd(from) && { gte: at(from, false) }), ...(isYmd(to) && { lte: at(to, true) }) } }),
      },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { issue: { include: { customer: { select: { name: true } } } } },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const users = await prisma.user.findMany({ select: { id: true, displayName: true } });
  const uname = (id: string) => users.find((u) => u.id === id)?.displayName ?? "—";

  return (
    <main className="page stack">
      <div className="page-head">
        <div><h1>证据库</h1><div className="sub">{rows.length} 份</div></div>
      </div>
      <form className="filters" method="get">
        <select name="customer" defaultValue={customer} aria-label="客户">
          <option value="">全部客户</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="type" defaultValue={type} aria-label="类型">
          <option value="">全部类型</option>
          {Object.entries(EVIDENCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="small muted">上传日</span>
        <input type="date" name="from" defaultValue={from} />
        <input type="date" name="to" defaultValue={to} />
        <label className="check"><input type="checkbox" name="hidden" value="1" defaultChecked={showHidden} />含已隐藏</label>
        <button className="btn btn-sm" type="submit">筛选</button>
      </form>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>预览</th><th>客户 / 课题</th><th>类型</th><th>说明</th><th>上传</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr className="empty-row"><td colSpan={5}>没有证据</td></tr> : rows.map((e) => (
              <tr key={e.id}>
                <td style={{ width: 140 }}>
                  <EvidenceThumbs items={[{ id: e.id, fileName: e.fileName, mime: e.mime, caption: "", typeLabel: e.fileName, hidden: !!e.hiddenAt, meta: "" }]} />
                </td>
                <td>
                  <div className="small muted">{e.issue.customer.name}</div>
                  <Link href={`/issues/${e.issueId}`}><span className="num">#{e.issue.customerSeq}</span> <TitleText title={e.issue.title} /></Link>
                </td>
                <td>{EVIDENCE_LABEL[e.type]}</td>
                <td>{e.caption || "—"}{e.hiddenAt && <div className="small muted">已隐藏：{e.hiddenReason}</div>}</td>
                <td className="small nowrap">{uname(e.uploadedById)}<br /><span className="num muted">{fmtDateTime(e.createdAt)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
