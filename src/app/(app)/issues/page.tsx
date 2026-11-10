import Link from "next/link";
import BulkBar from "@/components/BulkBar";
import IssueTable from "@/components/IssueTable";
import { CONFIRM_LABEL, WAITING_LABEL, resolveColumns } from "@/lib/labels";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/status";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { findIssues, PAGE_SIZE, param, type SearchParams } from "@/lib/server/issue-query";

export default async function IssuesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const customerId = param(sp, "customer");
  const [{ rows, total, page }, customers, priorities, types, sources, users, batches, contacts, anyIssue] = await Promise.all([
    findIssues(sp),
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, status: true } }),
    prisma.priority.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.issueType.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.source.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
    customerId ? prisma.meetingBatch.findMany({ where: { customerId }, orderBy: { meetingOn: "desc" } }) : Promise.resolve([]),
    customerId ? prisma.contact.findMany({ where: { customerId }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    prisma.issue.count({ take: 1 }),
  ]);
  const columns = resolveColumns(user.listColumns);
  const statusParam = param(sp, "status");
  const qs = (patch: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) u.set(k, v);
    for (const [k, v] of Object.entries(patch)) v ? u.set(k, v) : u.delete(k);
    return `?${u}`;
  };
  const sel = (name: string, options: { v: string; l: string }[], placeholder: string) => (
    <select name={name} defaultValue={param(sp, name)} aria-label={placeholder}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportHref = `/api/export/list${qs({ page: "" })}`;

  return (
    <main className="page page-wide" style={{ maxWidth: 1600 }}>
      <div className="page-head">
        <div>
          <h1>课题</h1>
          <div className="sub">{statusParam === "all" ? "全部" : statusParam ? "按状态" : "未完结"} · {total} 条</div>
        </div>
        <div className="row">
          <Link href="/settings/columns" className="btn btn-text">列设置</Link>
          <a href={exportHref} className="btn">导出当前列表</a>
          <a href={`${exportHref}${exportHref.includes("?") ? "&" : "?"}forCustomer=1`} className="btn">导出（给客户）</a>
          <Link href={`/issues/new${customerId ? `?customer=${customerId}` : ""}`} className="btn btn-primary">新建课题</Link>
        </div>
      </div>

      <div className="chips" style={{ marginBottom: 12 }}>
        <Link className="chip" href={qs({ status: "", page: "" })} aria-current={!statusParam ? "true" : undefined}>未完结</Link>
        {STATUS_ORDER.map((s) => (
          <Link key={s} className="chip" href={qs({ status: s, page: "" })} aria-current={statusParam === s ? "true" : undefined}>{STATUS_LABEL[s]}</Link>
        ))}
        <Link className="chip" href={qs({ status: "all", page: "" })} aria-current={statusParam === "all" ? "true" : undefined}>全部</Link>
      </div>

      <form className="filters" method="get">
        {statusParam && <input type="hidden" name="status" value={statusParam} />}
        {["dueSoon", "pendingLong", "createdTo"].map((k) => param(sp, k) && <input key={k} type="hidden" name={k} value={param(sp, k)} />)}
        <input type="search" name="q" defaultValue={param(sp, "q")} placeholder="关键词（标题、问题点、解决案、备注）" style={{ minWidth: 260 }} />
        {sel("customer", customers.map((c) => ({ v: c.id, l: c.status === "archived" ? `${c.name}（归档）` : c.name })), "全部客户")}
        {sel("priority", priorities.map((p) => ({ v: p.id, l: p.label })), "优先级")}
        {sel("assignee", [...users.map((u) => ({ v: u.id, l: u.displayName })), { v: "none", l: "未指定担当" }], "担当")}
        {sel("waiting", Object.entries(WAITING_LABEL).map(([v, l]) => ({ v, l })), "待谁处理")}
        <details open={["type", "source", "confirm", "batch", "reporter", "tag", "recFrom", "recTo", "dueFrom", "dueTo", "overdue", "noDue", "draft"].some((k) => param(sp, k))}>
          <summary>更多筛选</summary>
          <div className="filters-more">
            {sel("type", types.map((t) => ({ v: t.id, l: t.label })), "类型")}
            {sel("source", sources.map((t) => ({ v: t.id, l: t.label })), "来源")}
            {sel("confirm", Object.entries(CONFIRM_LABEL).map(([v, l]) => ({ v, l })), "确认类别")}
            {customerId && sel("batch", batches.map((b) => ({ v: b.id, l: b.title })), "会谈")}
            {customerId && sel("reporter", contacts.map((c) => ({ v: c.id, l: c.name })), "起票者")}
            <input type="text" name="tag" defaultValue={param(sp, "tag")} placeholder="标签" style={{ minWidth: 100 }} />
            <span className="small muted">记载日</span>
            <input type="date" name="recFrom" defaultValue={param(sp, "recFrom")} />
            <input type="date" name="recTo" defaultValue={param(sp, "recTo")} />
            <span className="small muted">期限</span>
            <input type="date" name="dueFrom" defaultValue={param(sp, "dueFrom")} />
            <input type="date" name="dueTo" defaultValue={param(sp, "dueTo")} />
            <label className="check"><input type="checkbox" name="overdue" value="1" defaultChecked={param(sp, "overdue") === "1"} />逾期</label>
            <label className="check"><input type="checkbox" name="noDue" value="1" defaultChecked={param(sp, "noDue") === "1"} />缺期限</label>
            <label className="check"><input type="checkbox" name="draft" value="1" defaultChecked={param(sp, "draft") === "1"} />标题待补</label>
          </div>
        </details>
        <select name="sort" defaultValue={param(sp, "sort")} aria-label="排序">
          <option value="">按更新时间</option>
          <option value="seq">按番号</option>
          <option value="recordedOn">按记载日</option>
          <option value="dueOn">按期限</option>
          <option value="priority">按优先级</option>
        </select>
        <select name="dir" defaultValue={param(sp, "dir")} aria-label="方向">
          <option value="">降序</option>
          <option value="asc">升序</option>
        </select>
        <button className="btn btn-sm" type="submit">筛选</button>
        <Link href="/issues" className="btn btn-text btn-sm">清除</Link>
      </form>

      {rows.length > 0 && <BulkBar users={users} />}

      <IssueTable
        rows={rows}
        columns={columns}
        selectable
        empty={
          anyIssue === 0 ? (
            <div className="stack-sm" style={{ justifyItems: "center" }}>
              <span>还没有课题</span>
              <span className="row">
                <Link href="/issues/new" className="btn btn-primary">新建课题</Link>
                <Link href="/import" className="btn btn-text">导入 Excel</Link>
              </span>
            </div>
          ) : (
            "没有符合条件的课题"
          )
        }
      />

      {pages > 1 && (
        <div className="pager">
          {page > 1 && <Link className="btn btn-sm" href={qs({ page: String(page - 1) })}>上一页</Link>}
          <span className="num">{page} / {pages}</span>
          {page < pages && <Link className="btn btn-sm" href={qs({ page: String(page + 1) })}>下一页</Link>}
        </div>
      )}
    </main>
  );
}
