import Link from "next/link";
import { fmtDateTime } from "@/lib/dates";
import { prisma } from "@/lib/server/db";
import { param, type SearchParams } from "@/lib/server/issue-query";

const ENTITY: Record<string, string> = {
  issue: "课题", customer: "客户", contact: "联系人", meeting: "会谈", user: "用户", settings: "设置",
  priority: "优先级", issueType: "类型", source: "来源", import: "导入",
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const entity = param(sp, "entity");
  const onlyException = param(sp, "exception") === "1";
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  const where = { ...(entity && { entityType: entity }), ...(onlyException && { isException: true }) };
  const [rows, users] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { at: "desc" }, skip: (page - 1) * 100, take: 101 }),
    prisma.user.findMany({ select: { id: true, displayName: true } }),
  ]);
  const uname = (id: string | null) => users.find((u) => u.id === id)?.displayName ?? "系统";
  const more = rows.length > 100;

  return (
    <main className="page stack">
      <div className="page-head"><div><h1>操作日志</h1><div className="sub">只增，不可修改或删除</div></div></div>
      <form className="filters" method="get">
        <select name="entity" defaultValue={entity} aria-label="对象">
          <option value="">全部对象</option>
          {Object.entries(ENTITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="check"><input type="checkbox" name="exception" value="1" defaultChecked={onlyException} />仅例外</label>
        <button className="btn btn-sm" type="submit">筛选</button>
      </form>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>时间</th><th>对象</th><th>动作</th><th>操作者</th><th>摘要</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr className="empty-row"><td colSpan={5}>暂无记录</td></tr> : rows.slice(0, 100).map((r) => (
              <tr key={r.id}>
                <td className="num small nowrap">{fmtDateTime(r.at)}</td>
                <td className="nowrap">{r.entityType === "issue" ? <Link href={`/issues/${r.entityId}`}>{ENTITY.issue}</Link> : ENTITY[r.entityType] ?? r.entityType}</td>
                <td className="nowrap">{r.action}{r.isException && <span className="tag tag-apricot" style={{ marginLeft: 6 }}>例外</span>}</td>
                <td className="nowrap">{uname(r.actorId)}</td>
                <td>{r.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        {page > 1 && <Link className="btn btn-sm" href={`?entity=${entity}&exception=${onlyException ? 1 : ""}&page=${page - 1}`}>上一页</Link>}
        <span className="num">第 {page} 页</span>
        {more && <Link className="btn btn-sm" href={`?entity=${entity}&exception=${onlyException ? 1 : ""}&page=${page + 1}`}>下一页</Link>}
      </div>
    </main>
  );
}
