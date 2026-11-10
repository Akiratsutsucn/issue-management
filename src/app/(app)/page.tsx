import Link from "next/link";
import { Dot } from "@/components/Pills";
import { WAITING_LABEL } from "@/lib/labels";
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from "@/lib/status";
import { getSettings } from "@/lib/server/settings";
import { overviewStats } from "@/lib/server/stats";

export default async function OverviewPage() {
  const settings = await getSettings();
  const s = await overviewStats(settings.reminderPendingDays);

  if (s.total === 0) {
    return (
      <main className="page">
        <div className="card empty">
          <h1 style={{ marginBottom: 8 }}>还没有课题</h1>
          <p>从第一条课题开始记录。客户可在新建时一并创建。</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link href="/issues/new" className="btn btn-primary">新建课题</Link>
            <Link href="/import" className="btn btn-text">导入 Excel</Link>
          </div>
        </div>
      </main>
    );
  }

  const maxCust = Math.max(1, ...s.byCustomer.map((c) => c.n));
  const maxUser = Math.max(1, ...s.byAssignee.map((c) => c.n));
  const fmt = (n: number | null) => (n === null ? "—" : `${Math.round(n * 10) / 10} 天`);

  return (
    <main className="page stack">
      <div className="page-head">
        <div>
          <h1>概览</h1>
          <div className="sub">{settings.teamName ? `${settings.teamName} · ` : ""}共 {s.total} 条课题</div>
        </div>
        <Link href="/issues" className="btn">未完结清单</Link>
      </div>

      <section className="kpis" aria-label="关键数字">
        <Link href="/issues" className="kpi lead">
          <span className="label">未完结</span>
          <span className="value">{s.unfinished}</span>
        </Link>
        <Link href="/issues?overdue=1" className="kpi">
          <span className="label">已逾期</span>
          <span className={`value${s.overdue ? " alert" : ""}`}>{s.overdue}</span>
        </Link>
        <Link href="/issues?dueSoon=1&sort=dueOn&dir=asc" className="kpi">
          <span className="label">七日内到期</span>
          <span className="value">{s.dueSoon}</span>
        </Link>
        <Link href={`/issues?pendingLong=${settings.reminderPendingDays}`} className="kpi">
          <span className="label">待确认超 {settings.reminderPendingDays} 天</span>
          <span className="value">{s.pendingLong}</span>
        </Link>
        <div className="kpi">
          <span className="label">高优先缺项</span>
          <span className="value">{s.highNoAssignee + s.highNoDue}</span>
          <span className="small muted">
            <Link href={`/issues?priority=${s.highId}&assignee=none`}>缺担当 {s.highNoAssignee}</Link>
            {" · "}
            <Link href={`/issues?priority=${s.highId}&noDue=1`}>缺期限 {s.highNoDue}</Link>
          </span>
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>按客户 · 未完结</h2></div>
          {s.byCustomer.length === 0 ? (
            <p className="muted">—</p>
          ) : (
            <div className="bars">
              {s.byCustomer.map((c) => (
                <Link key={c.id} href={`/issues?customer=${c.id}`} className="bar-row">
                  <span className="clip-1">{c.name}</span>
                  <span className="track"><span className="fill" style={{ width: `${(c.n / maxCust) * 100}%`, display: "block" }} /></span>
                  <span className="num">{c.n}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="card">
          <div className="card-head"><h2>按担当 · 未完结</h2></div>
          {s.byAssignee.length === 0 ? (
            <p className="muted">—</p>
          ) : (
            <div className="bars">
              {s.byAssignee.map((a) => (
                <Link key={a.id} href={`/issues?assignee=${a.id}`} className="bar-row">
                  <span>{a.name}</span>
                  <span className="track"><span className="fill" style={{ width: `${(a.n / maxUser) * 100}%`, display: "block", background: "#7BA3D0" }} /></span>
                  <span className="num">{a.n}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card stack-sm">
        <div className="row"><span className="section-label" style={{ width: 84, margin: 0 }}>状态</span>
          <div className="counts">
            {STATUS_ORDER.map((st) => (
              <Link key={st} href={`/issues?status=${st}`}><Dot color={STATUS_COLOR[st]} />{STATUS_LABEL[st]} <span className="num">{s.byStatus[st] ?? 0}</span></Link>
            ))}
          </div>
        </div>
        <div className="row"><span className="section-label" style={{ width: 84, margin: 0 }}>优先级</span>
          <div className="counts">
            {s.byPriority.map((p) => (
              <Link key={p.id} href={`/issues?priority=${p.id}`}><Dot color={p.color} />{p.label} <span className="num">{p.n}</span></Link>
            ))}
          </div>
        </div>
        <div className="row"><span className="section-label" style={{ width: 84, margin: 0 }}>待谁处理</span>
          <div className="counts">
            {(Object.keys(WAITING_LABEL) as (keyof typeof WAITING_LABEL)[]).map((w) => (
              <Link key={w} href={`/issues?waiting=${w}`}>{WAITING_LABEL[w]} <span className="num">{s.byWaiting[w] ?? 0}</span></Link>
            ))}
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 4 }}>
          响应：记载日到首次回答，中位 {fmt(s.response.median)}，平均 {fmt(s.response.avg)}（样本 {s.response.samples}）。未完结与分组计数只含未完结课题，状态计数含全部。
        </p>
      </section>
    </main>
  );
}
