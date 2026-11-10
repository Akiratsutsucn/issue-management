import { LIST_COLUMNS, resolveColumns } from "@/lib/labels";
import { requireUser } from "@/lib/server/auth";
import { saveColumnsAction } from "../../issues/actions";

export default async function ColumnsPage() {
  const user = await requireUser();
  const current = resolveColumns(user.listColumns);
  const pos = (k: string) => {
    const i = current.indexOf(k as (typeof current)[number]);
    return i < 0 ? "" : String(i + 1);
  };
  const ordered = [...LIST_COLUMNS].sort((a, b) => (Number(pos(a.key)) || 99) - (Number(pos(b.key)) || 99));
  return (
    <main className="page" style={{ maxWidth: 760 }}>
      <div className="page-head"><div><h1>列设置</h1><div className="sub">只影响你自己的课题列表。标「必要」的是必要 11 列（字段不会被删除，只是可隐藏）。</div></div></div>
      <form action={saveColumnsAction} className="card stack">
        <div className="table-wrap" style={{ boxShadow: "none", border: "1px solid var(--line)" }}>
          <table className="table">
            <thead><tr><th style={{ width: 60 }}>显示</th><th style={{ width: 90 }}>顺序</th><th>列</th></tr></thead>
            <tbody>
              {ordered.map((c) => (
                <tr key={c.key}>
                  <td><input type="checkbox" name="cols" value={c.key} defaultChecked={!!pos(c.key)} aria-label={`显示${c.label}`} /></td>
                  <td><input type="number" name={`order_${c.key}`} defaultValue={pos(c.key)} min={1} max={99} style={{ width: 70, height: 30 }} aria-label={`${c.label}顺序`} /></td>
                  <td>{c.label}{c.required && <span className="tag" style={{ height: 18, marginLeft: 6 }}>必要</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">按「顺序」数字从小到大排列。全部取消勾选会恢复默认。</p>
        <div className="row"><button className="btn btn-primary" type="submit">保存</button></div>
      </form>
    </main>
  );
}
