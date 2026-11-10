// 问题点 / 解决案：最新一条 + 历史（只增）
import { fmtDateTime } from "@/lib/dates";
import { ENTRY_LABEL } from "@/lib/labels";
import { addEntryAction, withdrawEntryAction } from "@/app/(app)/issues/actions";
import EntryComposer from "./EntryComposer";
import Rich from "./Rich";

export interface EntryRow {
  id: string;
  kind: "problem" | "solution";
  body: string;
  authorId: string;
  authorName: string;
  createdAt: Date;
  withdrawnAt: Date | null;
}

interface Props {
  issueId: string;
  kind: "problem" | "solution";
  entries: EntryRow[];
  answered: boolean;
  viewer: { id: string; role: string };
}

const WITHDRAW_MS = 5 * 60_000;

export default function EntrySection({ issueId, kind, entries, answered, viewer }: Props) {
  const list = entries.filter((e) => e.kind === kind).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const live = list.filter((e) => !e.withdrawnAt);
  const [latest] = live;
  const history = list.filter((e) => e !== latest);
  const now = Date.now();

  const one = (e: EntryRow, isLatest: boolean) => (
    <div key={e.id} className={`entry${isLatest ? " latest" : ""}`}>
      <div className="entry-meta">
        {e.authorName} · {fmtDateTime(e.createdAt)}
        {e.withdrawnAt && <span className="tag" style={{ marginLeft: 6 }}>已撤回</span>}
        {!e.withdrawnAt && viewer.role === "admin" && e.authorId === viewer.id && now - e.createdAt.getTime() < WITHDRAW_MS && (
          <form action={withdrawEntryAction.bind(null, issueId, e.id)} style={{ display: "inline" }}>
            <button className="btn btn-text btn-sm" type="submit">撤回</button>
          </form>
        )}
      </div>
      {e.withdrawnAt ? <span className="muted small">该条已撤回，记录保留于日志。</span> : <Rich html={e.body} />}
    </div>
  );

  return (
    <section className="card stack-sm">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2>{ENTRY_LABEL[kind]}</h2>
        <span className="small muted">共 {live.length} 条</span>
      </div>
      {latest ? one(latest, true) : <span className="muted">—</span>}
      {history.length > 0 && (
        <details>
          <summary className="small" style={{ cursor: "pointer", color: "var(--primary)" }}>展开历史（{history.length}）</summary>
          <div className="stack-sm" style={{ marginTop: 10 }}>{history.map((e) => one(e, false))}</div>
        </details>
      )}
      <EntryComposer action={addEntryAction.bind(null, issueId)} kind={kind} answered={answered} />
    </section>
  );
}
