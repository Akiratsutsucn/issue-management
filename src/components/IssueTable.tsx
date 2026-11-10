// 课题表格（服务端渲染）。列由用户列设置决定。
import Link from "next/link";
import { dateToYmd, fmtDateTime, todayShanghai } from "@/lib/dates";
import { CONFIRM_SHORT, LIST_COLUMNS, WAITING_LABEL, type ColumnKey } from "@/lib/labels";
import { richToText } from "@/lib/sanitize";
import { UNFINISHED } from "@/lib/status";
import { prisma } from "@/lib/server/db";
import { latestEntry, type IssueListRow } from "@/lib/server/issue-query";
import { PriorityPill, StatusPill, TitleText } from "./Pills";

const dash = (v: string) => v || "—";
const clip = (html: string) => {
  const t = richToText(html);
  return t ? <span className="clip">{t}</span> : "—";
};

function cell(k: ColumnKey, r: IssueListRow, today: string, names: Map<string, string>): React.ReactNode {
  switch (k) {
    case "seq":
      return <Link href={`/issues/${r.id}`} className="num">#{r.customerSeq}</Link>;
    case "title":
      return <Link href={`/issues/${r.id}`}><TitleText title={r.title} /></Link>;
    case "customer":
      return <Link href={`/customers/${r.customer.id}`} className="nowrap">{r.customer.shortName || r.customer.name}</Link>;
    case "project":
      return <Link href={`/projects/${r.serviceProject.id}`} className="clip">{r.serviceProject.name}</Link>;
    case "priority":
      return <PriorityPill p={r.priority} />;
    case "status":
      return <StatusPill status={r.status} />;
    case "waitingOn":
      return WAITING_LABEL[r.waitingOn];
    case "assignees": {
      const names = r.assignees.map((a) => a.user.displayName);
      if (r.teamAssigned) names.push("团队承接");
      return dash(names.join("、") || r.assigneeText);
    }
    case "dueOn": {
      if (!r.dueOn) return "—";
      const d = dateToYmd(r.dueOn);
      const overdue = d < today && UNFINISHED.includes(r.status);
      return (
        <span className={`num nowrap${overdue ? " danger-text" : ""}`}>
          {d}
          {overdue && <span className="tag tag-danger" style={{ marginLeft: 6 }}>逾期</span>}
        </span>
      );
    }
    case "nextAction":
      return r.nextAction ? <span className="clip">{r.nextAction}</span> : "—";
    case "recordedOn":
      return <span className="num nowrap">{dash(dateToYmd(r.recordedOn))}</span>;
    case "reporter":
      return dash(r.reporterContact?.name ?? r.reporterText);
    case "completion":
      return clip(r.completionCondition);
    case "problem":
      return clip(latestEntry(r, "problem"));
    case "solution":
      return clip(latestEntry(r, "solution"));
    case "updatedAt":
      return <span className="num nowrap small muted">{fmtDateTime(r.updatedAt)}</span>;
    case "type":
      return dash(r.issueType?.label ?? "");
    case "source":
      return dash(r.source?.label ?? "");
    case "confirmKind":
      return <span className={`tag ${r.confirmationKind === "confirmed_requirement" ? "tag-sage" : "tag-apricot"}`}>{CONFIRM_SHORT[r.confirmationKind]}</span>;
    case "meeting":
      return r.meetingBatch ? <Link href={`/meetings/${r.meetingBatch.id}`}>{r.meetingBatch.title}</Link> : "—";
    case "tags":
      return r.tags.length ? <span className="row">{r.tags.map((t) => <span key={t.tagId} className="tag">{t.tag.name}</span>)}</span> : "—";
    case "firstAnswered":
      return <span className="num">{dash(dateToYmd(r.firstAnsweredAt))}</span>;
    case "completedAt":
      return <span className="num">{dash(dateToYmd(r.completedAt))}</span>;
    case "confirmation":
      return r.completionConfirmName ? <span className="nowrap">{r.completionConfirmName} <span className="num small muted">{dateToYmd(r.completionConfirmedAt)}</span></span> : "—";
    case "evidence":
      return <span className="num">{r._count.evidences}</span>;
    case "links": {
      const other = [...r.linksFrom.map((l) => l.toIssue), ...r.linksTo.map((l) => l.fromIssue)];
      return other.length ? <span className="row">{other.map((o) => <Link key={o.id} href={`/issues/${o.id}`} className="num">#{o.customerSeq}</Link>)}</span> : "—";
    }
    case "internalNote":
      return clip(r.internalNote);
    case "createdBy":
      return dash(names.get(r.createdById) ?? "");
    case "updatedBy":
      return dash(names.get(r.updatedById) ?? "");
  }
}

interface Props {
  rows: IssueListRow[];
  columns: ColumnKey[];
  selectable?: boolean;
  empty?: React.ReactNode;
}

export default async function IssueTable({ rows, columns, selectable = false, empty }: Props) {
  const today = todayShanghai();
  const needNames = columns.includes("createdBy") || columns.includes("updatedBy");
  const users = needNames ? await prisma.user.findMany({ select: { id: true, displayName: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  const label = (k: ColumnKey) => LIST_COLUMNS.find((c) => c.key === k)?.label ?? k;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {selectable && <th style={{ width: 32 }}><span className="sr-only">选择</span></th>}
            {columns.map((k) => <th key={k} className={`col-${k}`}>{label(k)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={columns.length + (selectable ? 1 : 0)}>{empty ?? "没有符合条件的课题"}</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                {selectable && (
                  <td>
                    <input type="checkbox" name="ids" value={r.id} form="bulk-form" aria-label={`选择 #${r.customerSeq}`} />
                  </td>
                )}
                {columns.map((k) => <td key={k} className={`col-${k}`}>{cell(k, r, today, names)}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
