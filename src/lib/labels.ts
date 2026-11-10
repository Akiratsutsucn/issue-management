export const WAITING_LABEL = { us: "我方", customer: "客户", vendor: "原厂" } as const;
export const CONFIRM_LABEL = { confirmed_requirement: "客户已确认的要求", suggested_pending: "我方建议、待确认" } as const;
export const CONFIRM_SHORT = { confirmed_requirement: "已确认", suggested_pending: "待确认建议" } as const;
export const EVIDENCE_LABEL = {
  config_screenshot: "配置截图",
  test_record: "测试记录",
  customer_confirmation: "客户确认",
  other: "其他",
} as const;
export const ENTRY_LABEL = { problem: "问题点", solution: "解决案" } as const;
export const ROLE_LABEL = { admin: "管理员", member: "成员" } as const;

/** 列表可配置列。必要 11 列 + 客户为默认可见 */
export const LIST_COLUMNS = [
  { key: "seq", label: "番号", required: true },
  { key: "title", label: "标题", required: true },
  { key: "customer", label: "客户", required: true },
  { key: "project", label: "服务项目", required: true },
  { key: "priority", label: "优先级", required: true },
  { key: "status", label: "状态", required: true },
  { key: "waitingOn", label: "待谁处理", required: false },
  { key: "assignees", label: "担当", required: true },
  { key: "dueOn", label: "期限", required: true },
  { key: "nextAction", label: "下一步", required: false },
  { key: "recordedOn", label: "记载日", required: true },
  { key: "reporter", label: "起票者", required: true },
  { key: "completion", label: "完了条件", required: true },
  { key: "problem", label: "问题点", required: true },
  { key: "solution", label: "解决案", required: true },
  { key: "updatedAt", label: "更新", required: false },
  { key: "type", label: "类型", required: false },
  { key: "source", label: "来源", required: false },
  { key: "confirmKind", label: "确认类别", required: false },
  { key: "meeting", label: "会谈", required: false },
  { key: "tags", label: "标签", required: false },
  { key: "firstAnswered", label: "首次回答日", required: false },
  { key: "completedAt", label: "完成日", required: false },
  { key: "confirmation", label: "客户确认", required: false },
  { key: "evidence", label: "证据数", required: false },
  { key: "links", label: "关联课题", required: false },
  { key: "internalNote", label: "内部备注", required: false },
  { key: "createdBy", label: "创建者", required: false },
  { key: "updatedBy", label: "更新者", required: false },
] as const;

export type ColumnKey = (typeof LIST_COLUMNS)[number]["key"];

/** 默认：必要 11 列 + 客户 + 待谁处理/下一步/更新（02 与 05 的并集） */
export const DEFAULT_COLUMNS: ColumnKey[] = [
  "seq", "title", "customer", "project", "priority", "status", "waitingOn", "assignees", "dueOn", "nextAction",
  "recordedOn", "reporter", "completion", "problem", "solution", "updatedAt",
];

export function resolveColumns(saved: string[]): ColumnKey[] {
  const valid = new Set<string>(LIST_COLUMNS.map((c) => c.key));
  const cols = saved.filter((k): k is ColumnKey => valid.has(k));
  return cols.length ? cols : DEFAULT_COLUMNS;
}
