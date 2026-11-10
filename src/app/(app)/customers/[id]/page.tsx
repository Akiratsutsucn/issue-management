import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import IssueTable from "@/components/IssueTable";
import { fmtDate } from "@/lib/dates";
import { resolveColumns } from "@/lib/labels";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { issueListInclude } from "@/lib/server/issue-query";
import { addContactAction, setCustomerStatusAction, updateContactAction, updateCustomerAction } from "../actions";

const contactFields = (c?: { name: string; title: string; department: string; phone: string; email: string; note: string }) => (
  <div className="form-grid">
    <label className="field"><span className="req">姓名/称谓</span><input type="text" name="name" defaultValue={c?.name} required maxLength={80} /></label>
    <label className="field"><span>职务</span><input type="text" name="title" defaultValue={c?.title} maxLength={80} /></label>
    <label className="field"><span>部门</span><input type="text" name="department" defaultValue={c?.department} maxLength={80} /></label>
    <label className="field"><span>电话</span><input type="text" name="phone" defaultValue={c?.phone} maxLength={60} /></label>
    <label className="field span-2"><span>邮箱</span><input type="text" name="email" defaultValue={c?.email} maxLength={120} /></label>
    <label className="field span-2"><span>备注</span><input type="text" name="note" defaultValue={c?.note} maxLength={1000} /></label>
  </div>
);

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { createdAt: "asc" } },
      meetings: { orderBy: [{ meetingOn: "desc" }, { createdAt: "desc" }], include: { _count: { select: { issues: true } } } },
    },
  });
  if (!customer) notFound();
  const issues = await prisma.issue.findMany({ where: { customerId: id }, orderBy: { customerSeq: "asc" }, include: issueListInclude, take: 500 });
  const archived = customer.status === "archived";

  return (
    <main className="page stack">
      <div className="crumbs"><Link href="/customers">客户</Link> / {customer.name}</div>
      <div className="page-head">
        <div>
          <h1>{customer.name}{archived && <span className="tag" style={{ marginLeft: 10, verticalAlign: "middle" }}>已归档</span>}</h1>
          <div className="sub">{customer.shortName || "—"} · 课题 {issues.length} 条</div>
        </div>
        <div className="row">
          <a className="btn" href={`/api/export/customer/${id}`}>导出</a>
          <a className="btn" href={`/api/export/customer/${id}?forCustomer=1`}>导出（给客户）</a>
          <a className="btn" href={`/api/export/customer/${id}?zip=1&forCustomer=1`}>导出含证据 zip</a>
          <Link className="btn btn-text" href={`/import?customer=${id}`}>导入到此客户</Link>
          <Link className="btn" href={`/customers/${id}/meetings/new`}>新建会谈</Link>
          <Link className="btn btn-primary" href={`/issues/new?customer=${id}`}>新建课题</Link>
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <section>
            <div className="card-head"><h2>课题</h2><Link href={`/issues?customer=${id}&status=all`} className="btn btn-text btn-sm">在列表中筛选</Link></div>
            <IssueTable
              rows={issues}
              columns={resolveColumns(user.listColumns).filter((c) => c !== "customer")}
              empty={<span>还没有课题。<Link href={`/issues/new?customer=${id}`} className="btn btn-text">新建课题</Link></span>}
            />
          </section>

          <section className="card">
            <div className="card-head"><h2>会谈 / 跟进</h2></div>
            {customer.meetings.length === 0 ? <span className="muted">—</span> : (
              <ul className="timeline" style={{ padding: 0, margin: 0 }}>
                {customer.meetings.map((m) => (
                  <li key={m.id}>
                    <span className="num small muted">{fmtDate(m.meetingOn)}</span>
                    <span><Link href={`/meetings/${m.id}`}>{m.title}</Link> <span className="small muted">· 课题 {m._count.issues}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="stack">
          <section className="card stack-sm">
            <h2>联系人</h2>
            {customer.contacts.length === 0 && <span className="muted small">—</span>}
            {customer.contacts.map((c) => (
              <details key={c.id}>
                <summary style={{ cursor: "pointer" }}>
                  {c.name}<span className="small muted">{[c.title, c.department].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
                </summary>
                <div style={{ marginTop: 8 }}>
                  <ActionForm action={updateContactAction.bind(null, id, c.id)} submitLabel="保存" submitClass="btn btn-sm">{contactFields(c)}</ActionForm>
                </div>
              </details>
            ))}
            <details>
              <summary className="small" style={{ cursor: "pointer", color: "var(--primary)" }}>添加联系人</summary>
              <div style={{ marginTop: 8 }}>
                <ActionForm action={addContactAction.bind(null, id)} submitLabel="添加" submitClass="btn btn-sm" resetOnOk>{contactFields()}</ActionForm>
              </div>
            </details>
          </section>

          <section className="card stack-sm">
            <h2>基本信息</h2>
            <ActionForm action={updateCustomerAction.bind(null, id)} submitLabel="保存" submitClass="btn btn-sm">
              <label className="field"><span className="req">名称</span><input type="text" name="name" defaultValue={customer.name} required maxLength={120} /></label>
              <label className="field"><span>简称</span><input type="text" name="shortName" defaultValue={customer.shortName} maxLength={60} /></label>
              <label className="field"><span>备注</span><textarea name="note" defaultValue={customer.note} rows={3} maxLength={2000} /></label>
            </ActionForm>
            <hr className="divider" />
            {archived ? (
              <ActionForm action={setCustomerStatusAction.bind(null, id)} submitLabel="恢复为进行中" submitClass="btn btn-sm">
                <input type="hidden" name="op" value="unarchive" />
              </ActionForm>
            ) : (
              <ActionForm action={setCustomerStatusAction.bind(null, id)} submitLabel="归档客户" submitClass="btn btn-danger btn-sm" confirmText="归档后该客户不再出现在新建课题的选择器中，课题与记录保留。继续？">
                <input type="hidden" name="op" value="archive" />
                <input type="text" name="reason" placeholder="归档理由（必填）" required maxLength={500} />
              </ActionForm>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
