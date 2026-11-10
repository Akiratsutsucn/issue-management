import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import IssueTable from "@/components/IssueTable";
import MeetingFields from "@/components/MeetingFields";
import { fmtDate } from "@/lib/dates";
import { resolveColumns } from "@/lib/labels";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { issueListInclude } from "@/lib/server/issue-query";
import { saveMeetingAction } from "../../customers/actions";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const m = await prisma.meetingBatch.findUnique({
    where: { id },
    include: { serviceProject: true, customer: { include: { contacts: { orderBy: { name: "asc" } }, projects: { orderBy: { createdAt: "desc" }, select: { id: true, name: true } } } }, attendees: { orderBy: { sortOrder: "asc" }, include: { contact: true } } },
  });
  if (!m) notFound();
  const [issues, users] = await Promise.all([
    prisma.issue.findMany({ where: { meetingBatchId: id }, orderBy: { customerSeq: "asc" }, include: issueListInclude }),
    prisma.user.findMany({ orderBy: { displayName: "asc" } }),
  ]);
  const attendeeText = (kind: string) =>
    m.attendees
      .filter((a) => a.kind === kind)
      .map((a) => (a.kind === "internal_user" ? users.find((u) => u.id === a.userId)?.displayName : a.kind === "contact" ? a.contact?.name : `${a.placeholderLabel}（待补）`))
      .join("、") || "—";

  return (
    <main className="page stack">
      <div className="crumbs"><Link href="/customers">客户</Link> / <Link href={`/customers/${m.customerId}`}>{m.customer.name}</Link>{m.serviceProject && <> / <Link href={`/projects/${m.serviceProject.id}`}>{m.serviceProject.name}</Link></>} / 会谈</div>
      <div className="page-head">
        <div>
          <h1>{m.title}</h1>
          <div className="sub">会谈日 {fmtDate(m.meetingOn)} · 更新日 {fmtDate(m.updatedOn)} · 更新者 {m.updaterText || "—"}</div>
        </div>
        <div className="row">
          <a className="btn" href={`/api/export/meeting/${id}`}>导出本批次</a>
          <a className="btn" href={`/api/export/meeting/${id}?forCustomer=1`}>导出（给客户）</a>
          <Link className="btn btn-primary" href={m.serviceProjectId ? `/issues/new?project=${m.serviceProjectId}&batch=${id}` : `/issues/new?customer=${m.customerId}&batch=${id}`}>在此下新建课题</Link>
        </div>
      </div>

      <section className="card grid-2" style={{ gap: 18 }}>
        <div><div className="section-label">出席 · 我方</div><p>{attendeeText("internal_user")}</p></div>
        <div><div className="section-label">出席 · 客侧</div><p>{[attendeeText("contact"), attendeeText("placeholder")].filter((x) => x !== "—").join("、") || "—"}</p></div>
        <div><div className="section-label">会谈信息</div><p style={{ whiteSpace: "pre-wrap" }}>{m.informationText || "—"}</p></div>
        <div><div className="section-label">填写口径</div><p style={{ whiteSpace: "pre-wrap" }}>{m.fillingNote || "—"}</p></div>
        <div><div className="section-label">来源文档</div><p>{m.sourceDocument || "—"}</p></div>
        <div><div className="section-label">分工建议</div><p style={{ whiteSpace: "pre-wrap" }}>{m.divisionNote || "—"}</p></div>
      </section>

      <section>
        <div className="card-head"><h2>本批次课题</h2></div>
        <IssueTable rows={issues} columns={resolveColumns(user.listColumns).filter((c) => c !== "customer" && c !== "meeting")} empty="本批次还没有课题" />
      </section>

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>编辑批次信息与出席</summary>
        <div style={{ marginTop: 14 }}>
          <ActionForm action={saveMeetingAction.bind(null, m.customerId, id)} submitLabel="保存" submitClass="btn btn-primary">
            <MeetingFields m={m} users={users.filter((u) => u.isActive)} contacts={m.customer.contacts} projects={m.customer.projects} />
          </ActionForm>
        </div>
      </details>
    </main>
  );
}
