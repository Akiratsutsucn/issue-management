import { requireUser } from "@/lib/server/auth";
import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { fmtDateTime, todayShanghai, ymdToDate } from "@/lib/dates";
import { UNFINISHED } from "@/lib/status";
import { prisma } from "@/lib/server/db";
import { createCustomerAction } from "./actions";

async function loadRows(status: "active" | "archived") {
  const today = ymdToDate(todayShanghai())!;
  const customers = await prisma.customer.findMany({
    where: { status },
    orderBy: { updatedAt: "desc" },
    include: { contacts: { orderBy: { createdAt: "asc" }, take: 1 } },
  });
  const ids = customers.map((c) => c.id);
  const [open, overdue, last] = await Promise.all([
    prisma.issue.groupBy({ by: ["customerId"], where: { customerId: { in: ids }, status: { in: UNFINISHED } }, _count: true }),
    prisma.issue.groupBy({ by: ["customerId"], where: { customerId: { in: ids }, status: { in: UNFINISHED }, dueOn: { lt: today } }, _count: true }),
    prisma.issue.groupBy({ by: ["customerId"], where: { customerId: { in: ids } }, _max: { updatedAt: true } }),
  ]);
  return customers.map((c) => ({
    ...c,
    open: open.find((x) => x.customerId === c.id)?._count ?? 0,
    overdue: overdue.find((x) => x.customerId === c.id)?._count ?? 0,
    last: [c.updatedAt, last.find((x) => x.customerId === c.id)?._max.updatedAt].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null,
  }));
}

function Table({ rows }: { rows: Awaited<ReturnType<typeof loadRows>> }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>名称</th><th>主联系人</th><th>进行中课题</th><th>逾期</th><th>最近更新</th></tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td><Link href={`/customers/${c.id}`}>{c.name}</Link>{c.shortName && <span className="muted small"> · {c.shortName}</span>}</td>
              <td>{c.contacts[0]?.name ?? "—"}</td>
              <td className="num"><Link href={`/issues?customer=${c.id}`}>{c.open}</Link></td>
              <td className={`num${c.overdue ? " danger-text" : ""}`}>{c.overdue ? <Link href={`/issues?customer=${c.id}&overdue=1`}>{c.overdue}</Link> : 0}</td>
              <td className="num small muted">{fmtDateTime(c.last)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function CustomersPage() {
  await requireUser();
  const [active, archived] = await Promise.all([loadRows("active"), loadRows("archived")]);
  return (
    <main className="page stack">
      <div className="page-head">
        <div>
          <h1>客户</h1>
          <div className="sub">进行中 {active.length} · 归档 {archived.length}</div>
        </div>
      </div>

      <details className="card" open={active.length === 0 && archived.length === 0}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>新建客户</summary>
        <div style={{ marginTop: 14 }}>
          <ActionForm action={createCustomerAction} submitLabel="新建客户" submitClass="btn btn-primary">
            <div className="form-grid">
              <label className="field span-2"><span className="req">名称</span><input type="text" name="name" required maxLength={120} /></label>
              <label className="field"><span>简称</span><input type="text" name="shortName" maxLength={60} /></label>
              <label className="field span-4"><span>备注</span><textarea name="note" maxLength={2000} rows={2} /></label>
            </div>
          </ActionForm>
        </div>
      </details>

      {active.length === 0 ? (
        <div className="card empty"><p>还没有客户。可在上方新建，或在新建课题时一并创建。</p></div>
      ) : (
        <Table rows={active} />
      )}

      {archived.length > 0 && (
        <details>
          <summary className="muted" style={{ cursor: "pointer", marginBottom: 10 }}>已归档客户（{archived.length}）</summary>
          <Table rows={archived} />
        </details>
      )}
    </main>
  );
}
