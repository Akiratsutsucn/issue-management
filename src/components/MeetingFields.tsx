import type { MeetingBatch } from "@prisma/client";
import { dateToYmd, todayShanghai } from "@/lib/dates";

interface Props {
  m?: MeetingBatch & { attendees: { kind: string; userId: string | null; contactId: string | null; placeholderLabel: string }[] };
  users: { id: string; displayName: string }[];
  contacts: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  defaultProjectId?: string;
}

export default function MeetingFields({ m, users, contacts, projects, defaultProjectId }: Props) {
  const has = (kind: string, id: string) => !!m?.attendees.some((a) => a.kind === kind && (a.userId === id || a.contactId === id));
  const placeholders = m?.attendees.filter((a) => a.kind === "placeholder").map((a) => a.placeholderLabel).join("\n") ?? "";
  return (
    <div className="stack">
      <div className="form-grid">
        <label className="field span-4"><span>服务项目</span>
          <select name="serviceProjectId" defaultValue={m ? (m.serviceProjectId ?? "") : (defaultProjectId ?? "")}>
            <option value="">不归属具体项目</option>
            {projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="field"><span>会谈日</span><input type="date" name="meetingOn" defaultValue={m ? dateToYmd(m.meetingOn) : todayShanghai()} /></label>
        <label className="field span-2" style={{ gridColumn: "span 3" }}><span>标题</span><input type="text" name="title" defaultValue={m?.title} placeholder="留空则为「YYYY-MM-DD 会谈」" maxLength={200} /></label>
        <label className="field"><span>更新日</span><input type="date" name="updatedOn" defaultValue={m ? dateToYmd(m.updatedOn) : ""} /></label>
        <label className="field"><span>更新者</span><input type="text" name="updaterText" defaultValue={m?.updaterText} maxLength={80} /></label>
        <label className="field span-2"><span>来源文档</span><input type="text" name="sourceDocument" defaultValue={m?.sourceDocument} maxLength={500} /></label>
        <label className="field span-4"><span>会谈信息</span><textarea name="informationText" defaultValue={m?.informationText} rows={3} maxLength={5000} /></label>
        <label className="field span-2"><span>填写口径</span><textarea name="fillingNote" defaultValue={m?.fillingNote} rows={2} maxLength={5000} /></label>
        <label className="field span-2"><span>分工建议</span><textarea name="divisionNote" defaultValue={m?.divisionNote} rows={2} maxLength={2000} /></label>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack-sm">
        <div className="section-label">出席 · 我方</div>
        <div className="row">
          {users.map((u) => (
            <label key={u.id} className="check"><input type="checkbox" name="attUser" value={u.id} defaultChecked={has("internal_user", u.id)} />{u.displayName}</label>
          ))}
        </div>
        <div className="section-label">出席 · 客侧</div>
        <div className="row">
          {contacts.length === 0 && <span className="small muted">该客户还没有联系人</span>}
          {contacts.map((c) => (
            <label key={c.id} className="check"><input type="checkbox" name="attContact" value={c.id} defaultChecked={has("contact", c.id)} />{c.name}</label>
          ))}
        </div>
        <label className="field"><span>待补姓名（每行一个，如「客户 IT 负责人」）</span><textarea name="attPlaceholders" defaultValue={placeholders} rows={2} maxLength={1000} /></label>
      </fieldset>
    </div>
  );
}
