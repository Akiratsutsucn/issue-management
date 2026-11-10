import Link from "next/link";
import IssueForm from "@/components/IssueForm";
import { todayShanghai } from "@/lib/dates";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { issueFormOptions } from "@/lib/server/form-options";
import { param, type SearchParams } from "@/lib/server/issue-query";
import { createIssueAction } from "../actions";

export default async function NewIssuePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const opts = await issueFormOptions();
  const customerId = opts.customers.some((c) => c.id === param(sp, "customer")) ? param(sp, "customer") : "";
  const batchId = param(sp, "batch");
  const medium = opts.priorities.find((p) => p.key === "medium") ?? opts.priorities[0];
  let seqHint: string | undefined;
  if (customerId) {
    const agg = await prisma.issue.aggregate({ where: { customerId }, _max: { customerSeq: true } });
    seqHint = `#${(agg._max.customerSeq ?? 0) + 1}（自动）`;
  }

  return (
    <main className="page" style={{ maxWidth: 1080 }}>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link href="/issues">课题</Link> / 新建</div>
          <h1>新建课题</h1>
        </div>
      </div>
      <IssueForm
        mode="create"
        action={createIssueAction}
        notice={param(sp, "created") === "1" ? "上一条已创建。客户与会谈已保留。" : undefined}
        values={{
          customerId,
          meetingBatchId: batchId,
          sourceId: "",
          issueTypeId: "",
          title: "",
          priorityId: medium?.id ?? "",
          confirmationKind: "suggested_pending",
          recordedOn: todayShanghai(),
          dueOn: "",
          waitingOn: "us",
          nextAction: "",
          reporterContactId: "",
          reporterText: "",
          assigneeIds: [user.id],
          teamAssigned: false,
          assigneeText: "",
          completionCondition: "",
          internalNote: "",
          tags: "",
        }}
        customers={opts.customers}
        priorities={opts.priorities}
        types={opts.types}
        sources={opts.sources}
        users={opts.users}
        canCreateCustomer={user.role === "admin" || opts.memberCanCreateCustomer}
        seqHint={seqHint}
      />
    </main>
  );
}
