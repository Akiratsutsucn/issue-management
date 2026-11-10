import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import EntrySection from "@/components/EntrySection";
import EvidenceThumbs from "@/components/EvidenceThumbs";
import EvidenceUpload from "@/components/EvidenceUpload";
import { ConfirmTag, PriorityPill, StatusPill, TitleText } from "@/components/Pills";
import Rich from "@/components/Rich";
import StatusForm from "@/components/StatusForm";
import { dateToYmd, fmtDate, fmtDateTime, todayShanghai } from "@/lib/dates";
import { EVIDENCE_LABEL, WAITING_LABEL } from "@/lib/labels";
import { allowedTargets, UNFINISHED } from "@/lib/status";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import {
  changeStatusAction,
  confirmAction,
  hideEvidenceAction,
  linkAction,
  milestoneAction,
  unlinkAction,
} from "../actions";

export default async function IssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const issue = await prisma.issue.findUnique({
    where: { id },
    include: {
      customer: true,
      serviceProject: true,
      meetingBatch: true,
      priority: true,
      issueType: true,
      source: true,
      reporterContact: true,
      assignees: { include: { user: true } },
      tags: { include: { tag: true } },
      entries: true,
      evidences: { orderBy: { createdAt: "desc" } },
      linksFrom: { include: { toIssue: { include: { customer: true, serviceProject: true } } } },
      linksTo: { include: { fromIssue: { include: { customer: true, serviceProject: true } } } },
    },
  });
  if (!issue) notFound();

  const [activities, contacts, projects, users] = await Promise.all([
    prisma.activity.findMany({ where: { issueId: id }, orderBy: { at: "desc" }, take: 200 }),
    prisma.contact.findMany({ where: { customerId: issue.customerId }, orderBy: { name: "asc" } }),
    prisma.serviceProject.findMany({ orderBy: [{ customer: { name: "asc" } }, { createdAt: "desc" }], select: { id: true, name: true, customer: { select: { name: true } } } }),
    prisma.user.findMany({ select: { id: true, displayName: true } }),
  ]);
  const uname = (uid: string | null) => users.find((u) => u.id === uid)?.displayName ?? "系统";
  const entries = issue.entries.map((e) => ({ ...e, authorName: uname(e.authorId) }));
  const visibleEvidence = issue.evidences.filter((e) => !e.hiddenAt);
  const due = dateToYmd(issue.dueOn);
  const overdue = due && due < todayShanghai() && UNFINISHED.includes(issue.status);
  const links = [
    ...issue.linksFrom.map((l) => ({ id: l.id, other: l.toIssue, note: l.note })),
    ...issue.linksTo.map((l) => ({ id: l.id, other: l.fromIssue, note: l.note })),
  ];
  const assigneeNames = [...issue.assignees.map((a) => a.user.displayName), ...(issue.teamAssigned ? ["团队承接"] : [])];

  return (
    <main className="page">
      <div className="crumbs">
        <Link href="/issues">课题</Link> / <Link href={`/customers/${issue.customerId}`}>{issue.customer.name}</Link> / <Link href={`/projects/${issue.serviceProjectId}`}>{issue.serviceProject.name}</Link>
        {issue.meetingBatch && <> / <Link href={`/meetings/${issue.meetingBatch.id}`}>{issue.meetingBatch.title}</Link></>}
      </div>
      <div className="page-head" style={{ alignItems: "flex-start" }}>
        <div className="stack-sm">
          <h1 className="issue-title"><span className="num muted" style={{ marginRight: 10 }}>#{issue.customerSeq}</span><TitleText title={issue.title} /></h1>
          <div className="row">
            <PriorityPill p={issue.priority} />
            <StatusPill status={issue.status} />
            <ConfirmTag kind={issue.confirmationKind} />
            {issue.exceptionalCompletion && <span className="tag tag-apricot">例外完成</span>}
            {issue.tags.map((t) => <Link key={t.tagId} href={`/issues?tag=${encodeURIComponent(t.tag.name)}&status=all`} className="tag">{t.tag.name}</Link>)}
          </div>
        </div>
        <Link href={`/issues/${id}/edit`} className="btn">编辑</Link>
      </div>

      <div className="split">
        <div className="stack">
          <section className="card">
            <div className="section-label">完了条件（Goal）</div>
            <Rich html={issue.completionCondition} />
            <p className="hint" style={{ marginTop: 8 }}>完成需要证据和客户确认</p>
          </section>

          <EntrySection issueId={id} kind="problem" entries={entries} answered={issue.status === "answered"} viewer={user} />
          <EntrySection issueId={id} kind="solution" entries={entries} answered={false} viewer={user} />

          <section className="card grid-2" style={{ gap: 20 }}>
            <div>
              <div className="section-label">下一步行动</div>
              <p>{issue.nextAction || "—"}</p>
            </div>
            <div>
              <div className="section-label">待谁处理</div>
              <p>{WAITING_LABEL[issue.waitingOn]}</p>
            </div>
          </section>

          <section className="card stack-sm">
            <div className="card-head" style={{ marginBottom: 0 }}>
              <h2>证据</h2>
              <span className="small muted">有效 {visibleEvidence.length} 份</span>
            </div>
            <EvidenceThumbs
              items={issue.evidences.map((e) => ({
                id: e.id,
                fileName: e.fileName,
                mime: e.mime,
                caption: e.caption,
                typeLabel: EVIDENCE_LABEL[e.type],
                hidden: !!e.hiddenAt,
                meta: `${uname(e.uploadedById)} · ${fmtDateTime(e.createdAt)}${e.hiddenAt ? ` · 隐藏理由：${e.hiddenReason}` : ""}`,
              }))}
            />
            <EvidenceUpload issueId={id} />
            {visibleEvidence.length > 0 && (
              <details>
                <summary className="small" style={{ cursor: "pointer", color: "var(--muted)" }}>隐藏某份证据</summary>
                <ActionForm action={hideEvidenceAction.bind(null, id)} submitLabel="隐藏" submitClass="btn btn-danger btn-sm" confirmText="隐藏后不计入完成条件，文件与记录保留。继续？" className="row">
                  <select name="evidenceId" style={{ width: "auto" }}>
                    {visibleEvidence.map((e) => <option key={e.id} value={e.id}>{e.fileName}</option>)}
                  </select>
                  <input type="text" name="reason" placeholder="理由（必填）" required maxLength={500} style={{ width: 220 }} />
                </ActionForm>
              </details>
            )}
          </section>

          <section className="card stack-sm">
            <h2>关联课题</h2>
            {links.length === 0 ? <span className="muted">—</span> : (
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }} className="stack-sm">
                {links.map((l) => (
                  <li key={l.id} className="row">
                    <Link href={`/issues/${l.other.id}`}>
                      <span className="muted">{l.other.serviceProject.name}</span> <span className="num">#{l.other.customerSeq}</span> <TitleText title={l.other.title} />
                    </Link>
                    <StatusPill status={l.other.status} />
                    {l.note && <span className="small muted">{l.note}</span>}
                    <form action={unlinkAction.bind(null, id, l.id)}><button className="btn btn-text btn-sm" type="submit">取消关联</button></form>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={linkAction.bind(null, id)} submitLabel="关联" submitClass="btn btn-sm" resetOnOk className="row">
              <select name="serviceProjectId" defaultValue={issue.serviceProjectId} style={{ width: "auto", maxWidth: 320 }} aria-label="服务项目">
                {projects.map((x) => <option key={x.id} value={x.id}>{x.customer.name} · {x.name}</option>)}
              </select>
              <input type="text" name="seq" placeholder="番号" style={{ width: 90 }} required />
              <input type="text" name="note" placeholder="备注（可选）" style={{ width: 200 }} maxLength={300} />
            </ActionForm>
          </section>

          <section className="card">
            <div className="section-label">内部备注 · 仅内部可见</div>
            <Rich html={issue.internalNote} />
          </section>

          <section className="card">
            <h2 style={{ marginBottom: 12 }}>时间线</h2>
            <ul className="timeline" style={{ padding: 0, margin: 0 }}>
              {activities.map((a) => (
                <li key={a.id}>
                  <span className="num small muted">{fmtDateTime(a.at)}</span>
                  <span>
                    <span className="muted">{uname(a.actorId)}</span> {a.summary}
                    {a.action === "update" && a.detail && <ChangeDetail detail={a.detail} />}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="stack">
          <section className="card stack-sm">
            <h2>状态</h2>
            <StatusForm
              key={issue.status}
              action={changeStatusAction.bind(null, id)}
              current={issue.status}
              targets={allowedTargets(issue.status)}
              isAdmin={user.role === "admin"}
              hasSolution={entries.some((e) => e.kind === "solution" && !e.withdrawnAt)}
              hasCompletionCondition={!!issue.completionCondition}
            />
          </section>

          <section className="card">
            <dl className="meta-list" style={{ margin: 0 }}>
              <dt>記載日</dt><dd className="num">{fmtDate(issue.recordedOn)}</dd>
              <dt>起票者</dt><dd>{issue.reporterContact?.name ?? (issue.reporterText || "—")}</dd>
              <dt>担当者</dt><dd>{assigneeNames.join("、") || issue.assigneeText || "—"}</dd>
              {issue.assigneeText && assigneeNames.length > 0 && <><dt>担当原文</dt><dd>{issue.assigneeText}</dd></>}
              <dt>期限</dt><dd className={`num${overdue ? " danger-text" : ""}`}>{due || "—"}{overdue && " · 逾期"}</dd>
              <dt>类型</dt><dd>{issue.issueType?.label ?? "—"}</dd>
              <dt>来源</dt><dd>{issue.source?.label ?? "—"}</dd>
              <dt>服务项目</dt><dd><Link href={`/projects/${issue.serviceProjectId}`}>{issue.serviceProject.name}</Link></dd>
              <dt>会谈</dt><dd>{issue.meetingBatch ? <Link href={`/meetings/${issue.meetingBatch.id}`}>{issue.meetingBatch.title}</Link> : "—"}</dd>
              <dt>首次回答日</dt><dd className="num">{fmtDate(issue.firstAnsweredAt)}</dd>
              <dt>完成日</dt><dd className="num">{fmtDate(issue.completedAt)}</dd>
              <dt>创建</dt><dd className="small">{uname(issue.createdById)} · {fmtDateTime(issue.createdAt)}</dd>
              <dt>更新</dt><dd className="small">{uname(issue.updatedById)} · {fmtDateTime(issue.updatedAt)}</dd>
            </dl>
            <details style={{ marginTop: 10 }}>
              <summary className="small" style={{ cursor: "pointer", color: "var(--muted)" }}>修改首次回答日 / 完成日</summary>
              <ActionForm action={milestoneAction.bind(null, id)} submitLabel="保存" submitClass="btn btn-sm">
                <input type="date" name="firstAnsweredAt" defaultValue={dateToYmd(issue.firstAnsweredAt)} aria-label="首次回答日" />
                <input type="date" name="completedAt" defaultValue={dateToYmd(issue.completedAt)} aria-label="完成日" />
              </ActionForm>
            </details>
          </section>

          <section className="card stack-sm">
            <h2>客户确认</h2>
            {issue.completionConfirmName ? (
              <p className="small">
                {issue.completionConfirmName} · <span className="num">{fmtDate(issue.completionConfirmedAt)}</span>
                {issue.completionConfirmMethod && ` · ${issue.completionConfirmMethod}`}
                {issue.completionConfirmNote && <><br /><span className="muted">{issue.completionConfirmNote}</span></>}
                <br /><span className="muted">由 {uname(issue.completionConfirmedByUserId)} 代录</span>
              </p>
            ) : <span className="muted small">尚未记录</span>}
            <details open={!issue.completionConfirmName && issue.status === "pending_customer"}>
              <summary className="small" style={{ cursor: "pointer", color: "var(--primary)" }}>{issue.completionConfirmName ? "更新确认" : "记录确认"}</summary>
              <ActionForm action={confirmAction.bind(null, id)} submitLabel="保存确认" submitClass="btn btn-sm">
                <select name="contactId" defaultValue={issue.completionConfirmContactId ?? ""}>
                  <option value="">选择联系人（可选）</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="text" name="name" placeholder="确认人" defaultValue={issue.completionConfirmName} maxLength={80} />
                <input type="date" name="confirmedOn" defaultValue={dateToYmd(issue.completionConfirmedAt) || todayShanghai()} required aria-label="确认日期" />
                <input type="text" name="method" placeholder="方式（会谈、邮件、企微…）" defaultValue={issue.completionConfirmMethod} maxLength={80} />
                <input type="text" name="note" placeholder="备注" defaultValue={issue.completionConfirmNote} maxLength={1000} />
              </ActionForm>
            </details>
          </section>
        </aside>
      </div>
    </main>
  );
}

function ChangeDetail({ detail }: { detail: unknown }) {
  const d = detail as { before?: Record<string, string>; after?: Record<string, string> };
  if (!d.after) return null;
  return (
    <span className="small muted" style={{ display: "block" }}>
      {Object.keys(d.after).map((k) => `${d.before?.[k] ?? "—"} → ${d.after?.[k]}`).join("；")}
    </span>
  );
}
