import { LIST_COLUMNS, resolveColumns } from "@/lib/labels";
import { requireUser } from "@/lib/server/auth";
import { saveColumnsAction } from "../../issues/actions";

export default async function ColumnsPage() {
  const user = await requireUser();
  const current = new Set<string>(resolveColumns(user.listColumns));
  return (
    <main className="page" style={{ maxWidth: 760 }}>
      <div className="page-head"><div><h1>列设置</h1><div className="sub">只影响你自己的课题列表。标「必要」的是必要 11 列。</div></div></div>
      <form action={saveColumnsAction} className="card stack">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {LIST_COLUMNS.map((c) => (
            <label key={c.key} className="check">
              <input type="checkbox" name="cols" value={c.key} defaultChecked={current.has(c.key)} />
              {c.label}
              {c.required && <span className="tag" style={{ height: 18 }}>必要</span>}
            </label>
          ))}
        </div>
        <p className="hint">列顺序按上表固定。全部取消勾选会恢复默认。</p>
        <div className="row"><button className="btn btn-primary" type="submit">保存</button></div>
      </form>
    </main>
  );
}
