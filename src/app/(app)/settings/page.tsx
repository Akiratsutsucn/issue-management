import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { Dot } from "@/components/Pills";
import { ROLE_LABEL } from "@/lib/labels";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { getSettings } from "@/lib/server/settings";
import { createUserAction, deleteVocabAction, saveSettingsAction, saveVocabAction, updateUserAction } from "./actions";

type Vocab = "priority" | "issueType" | "source";
const VOCAB_TITLE: Record<Vocab, string> = { priority: "优先级", issueType: "课题类型", source: "来源" };

interface VocabRow { id: string; label: string; description: string | null; color: string | null; sortOrder: number; isActive: boolean }

function vocabFields(v?: VocabRow) {
  return (
    <div className="row" style={{ alignItems: "flex-end" }}>
      <label className="field" style={{ width: 110 }}><span>名称</span><input type="text" name="label" defaultValue={v?.label} required maxLength={30} /></label>
      <label className="field" style={{ flex: 1, minWidth: 200 }}><span>说明</span><input type="text" name="description" defaultValue={v?.description ?? ""} maxLength={300} /></label>
      <label className="field" style={{ width: 100 }}><span>颜色</span><input type="text" name="color" defaultValue={v?.color ?? ""} placeholder="#RRGGBB" maxLength={7} /></label>
      <label className="field" style={{ width: 70 }}><span>排序</span><input type="number" name="sortOrder" defaultValue={v?.sortOrder ?? 9} min={0} max={999} /></label>
      <label className="field" style={{ width: 90 }}><span>状态</span>
        <select name="isActive" defaultValue={v?.isActive === false ? "off" : "on"}><option value="on">启用</option><option value="off">停用</option></select>
      </label>
    </div>
  );
}

function VocabSection({ kind, rows }: { kind: Vocab; rows: VocabRow[] }) {
  return (
    <section className="card stack-sm">
      <h2>{VOCAB_TITLE[kind]}</h2>
      {rows.map((v) => (
        <details key={v.id}>
          <summary style={{ cursor: "pointer" }} className="row">
            <Dot color={v.color} /> {v.label}
            {!v.isActive && <span className="tag">停用</span>}
            <span className="small muted">{v.description}</span>
          </summary>
          <div className="stack-sm" style={{ margin: "10px 0 6px" }}>
            <ActionForm action={saveVocabAction.bind(null, kind, v.id)} submitLabel="保存" submitClass="btn btn-sm">{vocabFields(v)}</ActionForm>
            <ActionForm action={deleteVocabAction.bind(null, kind, v.id)} submitLabel="删除" submitClass="btn btn-danger btn-sm" confirmText="删除词汇？在用课题会迁移到所选目标。" className="row">
              <select name="migrateTo" defaultValue="" style={{ width: "auto" }}>
                <option value="">在用课题迁移到…</option>
                {rows.filter((r) => r.id !== v.id).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </ActionForm>
          </div>
        </details>
      ))}
      <details>
        <summary className="small" style={{ cursor: "pointer", color: "var(--primary)" }}>新增</summary>
        <div style={{ marginTop: 8 }}><ActionForm action={saveVocabAction.bind(null, kind, null)} submitLabel="新增" submitClass="btn btn-sm" resetOnOk>{vocabFields()}</ActionForm></div>
      </details>
    </section>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  if (user.role !== "admin") {
    return (
      <main className="page">
        <div className="card stack-sm">
          <h1>设置</h1>
          <p className="muted">系统设置仅管理员可修改。</p>
          <Link href="/settings/columns" className="btn" style={{ justifySelf: "start" }}>列设置</Link>
        </div>
      </main>
    );
  }
  const [s, priorities, types, sources, users] = await Promise.all([
    getSettings(),
    prisma.priority.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.issueType.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.source.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] }),
  ]);
  const mb = (n: number) => Math.round(n / 1048576);

  return (
    <main className="page stack">
      <div className="page-head"><div><h1>设置</h1><div className="sub">修改均记入操作日志</div></div><Link href="/settings/columns" className="btn">列设置</Link></div>

      <section className="card">
        <h2 style={{ marginBottom: 12 }}>团队与阈值</h2>
        <ActionForm action={saveSettingsAction} submitLabel="保存" submitClass="btn btn-primary">
          <div className="form-grid">
            <label className="field span-2"><span>团队显示名</span><input type="text" name="teamName" defaultValue={s.teamName} maxLength={80} /></label>
            <label className="field"><span>临期提醒（天内）</span><input type="number" name="reminderDueSoonDays" defaultValue={s.reminderDueSoonDays} min={1} max={30} /></label>
            <label className="field"><span>待确认超过（天）</span><input type="number" name="reminderPendingDays" defaultValue={s.reminderPendingDays} min={1} max={90} /></label>
            <label className="field"><span>高优先缺期限宽限（天）</span><input type="number" name="reminderHighNoDueGraceDays" defaultValue={s.reminderHighNoDueGraceDays} min={0} max={30} /></label>
            <label className="field"><span>图片上限（MB）</span><input type="number" name="maxImageMb" defaultValue={mb(s.maxImageBytes)} min={1} max={50} /></label>
            <label className="field"><span>附件上限（MB）</span><input type="number" name="maxAttachmentMb" defaultValue={mb(s.maxAttachmentBytes)} min={1} max={100} /></label>
            <label className="field"><span>登录连续失败次数上限</span><input type="number" name="loginMaxFailures" defaultValue={s.loginMaxFailures} min={3} max={50} /></label>
            <label className="field"><span>锁定时长（分钟）</span><input type="number" name="loginLockMinutes" defaultValue={s.loginLockMinutes} min={1} max={1440} /></label>
            <label className="check" style={{ alignSelf: "end", paddingBottom: 8 }}><input type="checkbox" name="memberCanCreateCustomer" defaultChecked={s.memberCanCreateCustomer} />允许成员新建客户</label>
          </div>
          <p className="hint">邮件、企微通知为二期，当前未启用。</p>
        </ActionForm>
      </section>

      <div className="grid-2">
        <VocabSection kind="priority" rows={priorities} />
        <VocabSection kind="issueType" rows={types} />
        <VocabSection kind="source" rows={sources} />
      </div>

      <section className="card stack-sm">
        <h2>用户</h2>
        <div className="table-wrap" style={{ boxShadow: "none", border: "1px solid var(--line)" }}>
          <table className="table">
            <thead><tr><th>显示名</th><th>邮箱</th><th>角色</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.displayName}{u.aliases.length > 0 && <div className="small muted">别名：{u.aliases.join("、")}</div>}</td>
                  <td>{u.email}</td>
                  <td>{ROLE_LABEL[u.role]}</td>
                  <td>{u.isActive ? "启用" : <span className="muted">已停用</span>}</td>
                  <td>
                    <details>
                      <summary className="small" style={{ cursor: "pointer", color: "var(--primary)" }}>管理</summary>
                      <div className="stack-sm" style={{ marginTop: 8, minWidth: 320 }}>
                        <ActionForm action={updateUserAction.bind(null, u.id)} submitLabel="保存" submitClass="btn btn-sm">
                          <input type="hidden" name="op" value="update" />
                          <input type="text" name="displayName" defaultValue={u.displayName} maxLength={60} aria-label="显示名" />
                          <input type="text" name="aliases" defaultValue={u.aliases.join("、")} placeholder="别名，用顿号分隔" maxLength={300} aria-label="别名" />
                          <select name="role" defaultValue={u.role} aria-label="角色"><option value="member">成员</option><option value="admin">管理员</option></select>
                        </ActionForm>
                        <ActionForm action={updateUserAction.bind(null, u.id)} submitLabel="重置密码" submitClass="btn btn-sm" confirmText="重置后旧密码失效、会话退出。继续？">
                          <input type="hidden" name="op" value="reset" />
                        </ActionForm>
                        {u.id !== user.id && (
                          <ActionForm action={updateUserAction.bind(null, u.id)} submitLabel={u.isActive ? "停用" : "启用"} submitClass={u.isActive ? "btn btn-danger btn-sm" : "btn btn-sm"} confirmText={u.isActive ? "停用后该用户无法登录，记录保留。继续？" : undefined}>
                            <input type="hidden" name="op" value="toggle" />
                          </ActionForm>
                        )}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details>
          <summary className="small" style={{ cursor: "pointer", color: "var(--primary)" }}>新建用户</summary>
          <div style={{ marginTop: 10 }}>
            <ActionForm action={createUserAction} submitLabel="创建" submitClass="btn btn-primary btn-sm">
              <div className="form-grid">
                <label className="field"><span className="req">邮箱</span><input type="email" name="email" required maxLength={200} /></label>
                <label className="field"><span className="req">显示名</span><input type="text" name="displayName" required maxLength={60} /></label>
                <label className="field"><span>别名</span><input type="text" name="aliases" placeholder="用于导入匹配" maxLength={300} /></label>
                <label className="field"><span>角色</span><select name="role" defaultValue="member"><option value="member">成员</option><option value="admin">管理员</option></select></label>
              </div>
              <p className="hint">初始密码由系统生成，只显示一次，之后只能重置。</p>
            </ActionForm>
          </div>
        </details>
      </section>
    </main>
  );
}
