import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import IssueTable from "@/components/IssueTable";
import { fmtDate, todayShanghai, ymdToDate } from "@/lib/dates";
import { resolveColumns } from "@/lib/labels";
import { UNFINISHED } from "@/lib/status";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { issueListInclude } from "@/lib/server/issue-query";
import { setProjectStatusAction, updateProjectAction } from "../actions";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await prisma.serviceProject.findUnique({
    where: { id },
    include: {
      customer: true,
      meetings: { orderBy: [{ meetingOn: "desc" }, { createdAt: "desc" }], include: { _count: { select: { issues: true } } } },
    },
  });
  if (!project) notFound();
  const today = ymdToDate(todayShanghai())!;
  const [issues, unfinished, overdue] = await Promise.all([
    prisma.issue.findMany({ where: { serviceProjectId: id }, orderBy: { customerSeq: "asc" }, include: issueListInclude, take: 1000 }),
    prisma.issue.count({ where: { serviceProjectId: id, status: { in: UNFINISHED } } }),
    prisma.issue.count({ where: { serviceProjectId: id, status: { in: UNFINISHED }, dueOn: { lt: today } } }),
  ]);
  const archived = project.status === "archived";
  const columns = resolveColumns(user.listColumns).filter((c) => c !== "customer" && c !== "project");

  return (
    <main className="page page-wide stack" style={{ maxWidth: 1600 }}>
      <div className="crumbs"><Link href="/customers">客户</Link> / <Link href={`/customers/${project.customerId}`}>{project.customer.name}</Link> / 服务项目</div>
      <div className="page-head">
        <div>
          <h1>{project.name}{archived && <span className="tag" style={{ marginLeft: 10, verticalAlign: "middle" }}>已归档</span>}</h1>
          <div className="sub">
            {project.customer.name} · 课题 {issues.length} 条 · 未完结 {unfinished}
            {overdue > 0 && <> · <Link href={`/issues?project=${id}&overdue=1`} className="danger-text">逾期 {overdue}</Link></>}
          </div>
        </div>
        <div className="row">
          <a className="btn" href={`/api/export/project/${id}`}>导出</a>
          <a className="btn" href={`/api/export/project/${id}?forCustomer=1`}>导出（给客户）</a>
          <a className="btn" href={`/api/export/project/${id}?zip=1&forCustomer=1`}>导出含证据 zip</a>
          <Link className="btn btn-text" href={`/import?project=${id}`}>导入到此项目</Link>
          <Link className="btn" href={`/customers/${project.customerId}/meetings/new?project=${id}`}>新建会谈</Link>
          <Link className="btn btn-primary" href={`/issues/new?project=${id}`}>新建课题</Link>
        </div>
      </div>

      <section className="stack-sm">
        <div className="card-head" style={{ marginBottom: 0 }}>
          <h2>课题</h2>
          <Link href={`/issues?project=${id}`} className="btn btn-text btn-sm">在列表中筛选</Link>
        </div>
        <IssueTable
          rows={issues}
          columns={columns}
          empty={<span>本项目还没有课题。<Link href={`/issues/new?project=${id}`} className="btn btn-text">新建课题</Link></span>}
        />
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>会谈 / 跟进</h2></div>
          {project.meetings.length === 0 ? <span className="muted">—</span> : (
            <ul className="timeline" style={{ padding: 0, margin: 0 }}>
              {project.meetings.map((m) => (
                <li key={m.id}>
                  <span className="num small muted">{fmtDate(m.meetingOn)}</span>
                  <span><Link href={`/meetings/${m.id}`}>{m.title}</Link> <span className="small muted">· 课题 {m._count.issues}</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card stack-sm">
          <h2>项目信息</h2>
          <ActionForm action={updateProjectAction.bind(null, id)} submitLabel="保存" submitClass="btn btn-sm">
            <label className="field"><span className="req">名称</span><input type="text" name="name" defaultValue={project.name} required maxLength={160} /></label>
            <label className="field"><span>备注</span><textarea name="note" defaultValue={project.note} rows={3} maxLength={2000} /></label>
          </ActionForm>
          <hr className="divider" />
          {archived ? (
            <ActionForm action={setProjectStatusAction.bind(null, id)} submitLabel="恢复为进行中" submitClass="btn btn-sm">
              <input type="hidden" name="op" value="unarchive" />
            </ActionForm>
          ) : (
            <ActionForm action={setProjectStatusAction.bind(null, id)} submitLabel="归档项目" submitClass="btn btn-danger btn-sm" confirmText="归档后新建课题时不再显示该项目，课题与记录保留。继续？">
              <input type="hidden" name="op" value="archive" />
              <input type="text" name="reason" placeholder="归档理由（必填）" required maxLength={500} />
            </ActionForm>
          )}
        </section>
      </div>
    </main>
  );
}
