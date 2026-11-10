import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import { fmtDate, todayShanghai, ymdToDate } from "@/lib/dates";
import { UNFINISHED } from "@/lib/status";
import { createProjectAction } from "../../projects/actions";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
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
  await requireUser();
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { createdAt: "asc" } },
      meetings: {
        orderBy: [{ meetingOn: "desc" }, { createdAt: "desc" }],
        include: { _count: { select: { issues: true } }, serviceProject: { select: { name: true } } },
      },
      projects: { orderBy: [{ status: "asc" }, { createdAt: "desc" }] },
    },
  });
  if (!customer) notFound();
  const today = ymdToDate(todayShanghai())!;
  const ids = customer.projects.map((p) => p.id);
  const [all, open, late] = await Promise.all([
    prisma.issue.groupBy({ by: ["serviceProjectId"], where: { serviceProjectId: { in: ids } }, _count: true }),
    prisma.issue.groupBy({ by: ["serviceProjectId"], where: { serviceProjectId: { in: ids }, status: { in: UNFINISHED } }, _count: true }),
    prisma.issue.groupBy({ by: ["serviceProjectId"], where: { serviceProjectId: { in: ids }, status: { in: UNFINISHED }, dueOn: { lt: today } }, _count: true }),
  ]);
  const n = (rows: { serviceProjectId: string; _count: number }[], pid: string) => rows.find((r) => r.serviceProjectId === pid)?._count ?? 0;
  const issueTotal = all.reduce((a, r) => a + r._count, 0);
  const archived = customer.status === "archived";

  return (
    <main className="page stack">
      <div className="crumbs"><Link href="/customers">客户</Link> / {customer.name}</div>
      <div className="page-head">
        <div>
          <h1>{customer.name}{archived && <span className="tag" style={{ marginLeft: 10, verticalAlign: "middle" }}>已归档</span>}</h1>
          <div className="sub">{customer.shortName || "—"} · 服务项目 {customer.projects.length} 个 · 课题 {issueTotal} 条</div>
        </div>
        <div className="row">
          <a className="btn" href={`/api/export/customer/${id}`}>导出</a>
          <a className="btn" href={`/api/export/customer/${id}?forCustomer=1`}>导出（给客户）</a>
          <a className="btn" href={`/api/export/customer/${id}?zip=1&forCustomer=1`}>导出含证据 zip</a>
          <Link className="btn" href={`/customers/${id}/meetings/new`}>新建会谈</Link>
          <Link className="btn btn-primary" href={`/issues/new?customer=${id}`}>新建课题</Link>
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <section className="card stack-sm">
            <div className="card-head" style={{ marginBottom: 0 }}>
              <h2>服务项目</h2>
              <Link href={`/issues?customer=${id}&status=all`} className="btn btn-text btn-sm">该客户全部课题</Link>
            </div>
            {customer.projects.length === 0 ? (
              <span className="muted">还没有服务项目。新建后，在项目中记录课题。</span>
            ) : (
              <div className="project-list">
                {customer.projects.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="project-row">
                    <span className="stack-sm" style={{ gap: 2 }}>
                      <span className="name">{p.name}{p.status === "archived" && <span className="tag" style={{ marginLeft: 8 }}>已归档</span>}</span>
                      {p.note && <span className="small muted clip-1">{p.note}</span>}
                    </span>
                    <span className="row small muted">
                      <span>课题 <b className="num" style={{ color: "var(--text)" }}>{n(all, p.id)}</b></span>
                      <span>未完结 <b className="num" style={{ color: "var(--text)" }}>{n(open, p.id)}</b></span>
                      {n(late, p.id) > 0 && <span className="danger-text">逾期 <b className="num">{n(late, p.id)}</b></span>}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <details>
              <summary className="small" style={{ cursor: "pointer", color: "var(--primary)" }}>新建服务项目</summary>
              <div style={{ marginTop: 10 }}>
                <ActionForm action={createProjectAction.bind(null, id)} submitLabel="新建" submitClass="btn btn-primary btn-sm">
                  <label className="field"><span className="req">名称</span><input type="text" name="name" required maxLength={160} placeholder="例如：2026年企业微信咨询服务项目" /></label>
                  <label className="field"><span>备注</span><input type="text" name="note" maxLength={2000} /></label>
                </ActionForm>
              </div>
            </details>
          </section>

          <section className="card">
            <div className="card-head"><h2>会谈 / 跟进</h2></div>
            {customer.meetings.length === 0 ? <span className="muted">—</span> : (
              <ul className="timeline" style={{ padding: 0, margin: 0 }}>
                {customer.meetings.map((m) => (
                  <li key={m.id}>
                    <span className="num small muted">{fmtDate(m.meetingOn)}</span>
                    <span><Link href={`/meetings/${m.id}`}>{m.title}</Link> <span className="small muted">· {m.serviceProject?.name ?? "未归属项目"} · 课题 {m._count.issues}</span></span>
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
