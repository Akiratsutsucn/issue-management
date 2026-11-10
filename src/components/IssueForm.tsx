"use client";

// 新建/编辑课题表单
import { useActionState, useState } from "react";
import type { FormState } from "@/app/(app)/issues/actions";
import { CONFIRM_LABEL, WAITING_LABEL } from "@/lib/labels";
import RichEditor from "./RichEditor";

export interface CustomerOpt {
  id: string;
  name: string;
  contacts: { id: string; name: string }[];
  batches: { id: string; title: string; serviceProjectId: string | null }[];
  projects: { id: string; name: string }[];
}
export interface Opt {
  id: string;
  label: string;
}

export interface IssueFormValues {
  customerId: string;
  serviceProjectId: string;
  meetingBatchId: string;
  sourceId: string;
  issueTypeId: string;
  title: string;
  priorityId: string;
  confirmationKind: keyof typeof CONFIRM_LABEL;
  recordedOn: string;
  dueOn: string;
  waitingOn: keyof typeof WAITING_LABEL;
  nextAction: string;
  reporterContactId: string;
  reporterText: string;
  assigneeIds: string[];
  teamAssigned: boolean;
  assigneeText: string;
  completionCondition: string;
  internalNote: string;
  tags: string;
}

interface Props {
  mode: "create" | "edit";
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  values: IssueFormValues;
  customers: CustomerOpt[];
  priorities: Opt[];
  types: Opt[];
  sources: Opt[];
  users: Opt[];
  canCreateCustomer: boolean;
  seqHint?: string;
  seqByProject?: Record<string, number>;
  notice?: string;
}

export default function IssueForm(p: Props) {
  const [state, action, pending] = useActionState(p.action, { error: "" });
  const v = p.values;
  const [customerId, setCustomerId] = useState(v.customerId);
  const [newCustomer, setNewCustomer] = useState(!v.customerId && p.customers.length === 0 && p.canCreateCustomer);
  const cust = p.customers.find((c) => c.id === customerId);
  const [projectId, setProjectId] = useState(v.serviceProjectId);
  const [newProject, setNewProject] = useState(false);
  const project = cust?.projects.find((x) => x.id === projectId);
  const editProject = p.mode === "edit" ? p.customers.flatMap((c) => c.projects).find((x) => x.id === v.serviceProjectId) : undefined;
  // 会谈只列出属于当前项目或未归属项目的
  const batches = cust?.batches.filter((b) => !b.serviceProjectId || b.serviceProjectId === (p.mode === "edit" ? v.serviceProjectId : projectId)) ?? [];

  return (
    <form action={action} className="card" style={{ padding: "8px 28px 24px" }}>
      {p.notice && <div className="ok-box" style={{ marginTop: 16 }}>{p.notice}</div>}

      <section className="form-section">
        <h2>归属</h2>
        <div className="form-grid">
          {p.mode === "create" ? (
            <label className="field span-2">
              <span className="req">客户</span>
              {newCustomer ? (
                <input type="text" name="newCustomerName" placeholder="新客户名称" required maxLength={120} />
              ) : (
                <select
                  name="customerId"
                  value={customerId}
                  onChange={(e) => {
                    const next = p.customers.find((c) => c.id === e.target.value);
                    setCustomerId(e.target.value);
                    setNewProject(false);
                    setProjectId(next?.projects.length === 1 ? next.projects[0].id : "");
                  }}
                  required
                >
                  <option value="">选择客户</option>
                  {p.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {p.canCreateCustomer && (
                <button type="button" className="btn btn-text btn-sm" style={{ justifySelf: "start" }} onClick={() => { setNewCustomer(!newCustomer); setNewProject(!newCustomer); setProjectId(""); }}>
                  {newCustomer ? "选择已有客户" : "同时新建客户"}
                </button>
              )}
            </label>
          ) : (
            <div className="field span-2">
              <span>客户</span>
              <span style={{ color: "var(--text)", paddingTop: 6 }}>{cust?.name}</span>
            </div>
          )}
          {p.mode === "create" ? (
            <label className="field span-2">
              <span className="req">服务项目</span>
              {newProject || newCustomer || (cust && cust.projects.length === 0) ? (
                <input type="text" name="newProjectName" placeholder="例如：2026年企业微信咨询服务项目" required maxLength={160} key={`np-${customerId}`} />
              ) : (
                <select name="serviceProjectId" value={projectId} onChange={(e) => setProjectId(e.target.value)} required disabled={!cust}>
                  <option value="">{cust ? "选择服务项目" : "先选择客户"}</option>
                  {cust?.projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              )}
              {cust && cust.projects.length > 0 && !newCustomer && (
                <button type="button" className="btn btn-text btn-sm" style={{ justifySelf: "start" }} onClick={() => { setNewProject(!newProject); setProjectId(""); }}>
                  {newProject ? "选择已有项目" : "新建服务项目"}
                </button>
              )}
            </label>
          ) : (
            <div className="field span-2">
              <span>服务项目</span>
              <span style={{ color: "var(--text)", paddingTop: 6 }}>{editProject?.name}{p.seqHint ? ` · ${p.seqHint}` : ""}</span>
            </div>
          )}
          <label className="field span-2">
            <span>会谈 / 跟进批次</span>
            <select name="meetingBatchId" defaultValue={v.meetingBatchId} key={`b-${customerId}-${projectId}`} disabled={!cust}>
              <option value="">不绑定</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          </label>
          <label className="field">
            <span>来源</span>
            <select name="sourceId" defaultValue={v.sourceId}>
              <option value="">—</option>
              {p.sources.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>课题类型</span>
            <select name="issueTypeId" defaultValue={v.issueTypeId}>
              <option value="">—</option>
              {p.types.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          {p.mode === "create" && (
            <div className="field span-2">
              <span>番号</span>
              <span className="num" style={{ color: "var(--text)", paddingTop: 6 }}>
                {project && p.seqByProject?.[project.id] ? `#${p.seqByProject[project.id]}（自动）` : "保存时按服务项目自动编号"}
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="form-section">
        <h2>基本</h2>
        <div className="form-grid">
          <label className="field span-4">
            <span>課題（标题）</span>
            <input type="text" name="title" defaultValue={v.title} maxLength={300} placeholder="可暂空，空则标「标题待补」" />
          </label>
          <label className="field">
            <span className="req">優先度</span>
            <select name="priorityId" defaultValue={v.priorityId} required>
              {p.priorities.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>确认类别</span>
            <select name="confirmationKind" defaultValue={v.confirmationKind}>
              {Object.entries(CONFIRM_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="field">
            <span>記載日</span>
            <input type="date" name="recordedOn" defaultValue={v.recordedOn} />
          </label>
          <label className="field">
            <span>期限</span>
            <input type="date" name="dueOn" defaultValue={v.dueOn} />
          </label>
          <label className="field">
            <span>待谁处理</span>
            <select name="waitingOn" defaultValue={v.waitingOn}>
              {Object.entries(WAITING_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="field span-2" style={{ gridColumn: "span 3" }}>
            <span>下一步行动</span>
            <input type="text" name="nextAction" defaultValue={v.nextAction} maxLength={500} />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>人员</h2>
        <div className="form-grid">
          <label className="field span-2">
            <span>起票者（客侧联系人）</span>
            <select name="reporterContactId" defaultValue={v.reporterContactId} key={`c-${customerId}`} disabled={!cust}>
              <option value="">—</option>
              {cust?.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field span-2">
            <span>起票者原文</span>
            <input type="text" name="reporterText" defaultValue={v.reporterText} maxLength={200} placeholder="联系人未建档时填写" />
          </label>
          <fieldset className="field span-4" style={{ border: 0, padding: 0, margin: 0 }}>
            <span>担当者</span>
            <div className="row" style={{ paddingTop: 4 }}>
              {p.users.map((u) => (
                <label key={u.id} className="check">
                  <input type="checkbox" name="assigneeIds" value={u.id} defaultChecked={v.assigneeIds.includes(u.id)} />
                  {u.label}
                </label>
              ))}
              <label className="check" style={{ marginLeft: 8 }}>
                <input type="checkbox" name="teamAssigned" defaultChecked={v.teamAssigned} />团队承接
              </label>
            </div>
          </fieldset>
          <label className="field span-4">
            <span>担当原文</span>
            <input type="text" name="assigneeText" defaultValue={v.assigneeText} maxLength={200} placeholder="可选，保留原始写法" />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>完了条件</h2>
        <RichEditor name="completionCondition" defaultValue={v.completionCondition} placeholder="Goal：达到什么状态算完成" note="完成需要证据和客户确认" />
      </section>

      {p.mode === "create" && (
        <>
          <section className="form-section">
            <h2>問題点</h2>
            <RichEditor name="problem" placeholder="可粘贴截图" />
          </section>
          <section className="form-section">
            <h2>解決案</h2>
            <RichEditor name="solution" placeholder="可粘贴截图" />
          </section>
        </>
      )}

      <section className="form-section">
        <h2>标签与备注</h2>
        <div className="stack">
          <label className="field">
            <span>标签</span>
            <input type="text" name="tags" defaultValue={v.tags} placeholder="用逗号或顿号分隔" maxLength={500} />
          </label>
          <div className="field">
            <span>内部备注（导出给客户时隐藏）</span>
            <RichEditor name="internalNote" defaultValue={v.internalNote} />
          </div>
        </div>
      </section>

      {state.error && <div className="error-box" role="alert" style={{ marginBottom: 12 }}>{state.error}</div>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        {p.mode === "create" ? (
          <>
            <button className="btn" type="submit" name="next" value="another" disabled={pending}>创建后再建一条</button>
            <button className="btn btn-primary" type="submit" name="next" value="open" disabled={pending}>{pending ? "保存中…" : "创建并打开"}</button>
          </>
        ) : (
          <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "保存中…" : "保存"}</button>
        )}
      </div>
    </form>
  );
}
