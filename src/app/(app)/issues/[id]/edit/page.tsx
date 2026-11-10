import Link from "next/link";
import { notFound } from "next/navigation";
import IssueForm from "@/components/IssueForm";
import { dateToYmd } from "@/lib/dates";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { issueFormOptions } from "@/lib/server/form-options";
import { updateIssueAction } from "../../actions";

export default async function EditIssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const issue = await prisma.issue.findUnique({ where: { id }, include: { assignees: true, tags: { include: { tag: true } } } });
  if (!issue) notFound();
  const opts = await issueFormOptions(issue.customerId);

  return (
    <main className="page" style={{ maxWidth: 1080 }}>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link href="/issues">课题</Link> / <Link href={`/issues/${id}`}>#{issue.customerSeq}</Link> / 编辑</div>
          <h1>编辑课题</h1>
          <div className="sub">问题点与解决案在详情页追加，历史不会被覆盖。</div>
        </div>
      </div>
      <IssueForm
        mode="edit"
        action={updateIssueAction.bind(null, id)}
        values={{
          customerId: issue.customerId,
          meetingBatchId: issue.meetingBatchId ?? "",
          sourceId: issue.sourceId ?? "",
          issueTypeId: issue.issueTypeId ?? "",
          title: issue.title,
          priorityId: issue.priorityId,
          confirmationKind: issue.confirmationKind,
          recordedOn: dateToYmd(issue.recordedOn),
          dueOn: dateToYmd(issue.dueOn),
          waitingOn: issue.waitingOn,
          nextAction: issue.nextAction,
          reporterContactId: issue.reporterContactId ?? "",
          reporterText: issue.reporterText,
          assigneeIds: issue.assignees.map((a) => a.userId),
          teamAssigned: issue.teamAssigned,
          assigneeText: issue.assigneeText,
          completionCondition: issue.completionCondition,
          internalNote: issue.internalNote,
          tags: issue.tags.map((t) => t.tag.name).join("、"),
        }}
        customers={opts.customers}
        priorities={opts.priorities}
        types={opts.types}
        sources={opts.sources}
        users={opts.users}
        canCreateCustomer={user.role === "admin" || opts.memberCanCreateCustomer}
        seqHint={`#${issue.customerSeq}`}
      />
    </main>
  );
}
