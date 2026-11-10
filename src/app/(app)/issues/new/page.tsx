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
  // 只给项目 id 时，从项目反推客户
  const projectParam = param(sp, "project");
  const projectOwner = opts.customers.find((c) => c.projects.some((x) => x.id === projectParam));
  const customerId = projectOwner?.id ?? (opts.customers.some((c) => c.id === param(sp, "customer")) ? param(sp, "customer") : "");
  const serviceProjectId = projectOwner ? projectParam : (opts.customers.find((c) => c.id === customerId)?.projects.length === 1 ? opts.customers.find((c) => c.id === customerId)!.projects[0].id : "");
  const batchId = param(sp, "batch");
  const medium = opts.priorities.find((p) => p.key === "medium") ?? opts.priorities[0];
  const maxes = await prisma.issue.groupBy({ by: ["serviceProjectId"], _max: { customerSeq: true } });
  const seqByProject = Object.fromEntries(
    opts.customers.flatMap((c) => c.projects).map((x) => [x.id, (maxes.find((m) => m.serviceProjectId === x.id)?._max.customerSeq ?? 0) + 1]),
  );

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
        notice={param(sp, "created") === "1" ? "上一条已创建。客户、服务项目与会谈已保留。" : undefined}
        values={{
          customerId,
          serviceProjectId,
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
        seqByProject={seqByProject}
      />
    </main>
  );
}
