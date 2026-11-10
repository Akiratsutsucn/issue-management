// 表单输入校验（zod）
import { z } from "zod";
import { isYmd } from "./dates";

const str = (max: number) => z.string().trim().max(max, `不能超过 ${max} 字`);
const optId = z.string().trim().max(40).optional().transform((v) => (v ? v : null));
const ymd = z
  .string()
  .trim()
  .optional()
  .transform((v) => v ?? "")
  .refine((v) => v === "" || isYmd(v), "日期格式应为 YYYY-MM-DD");
const rich = z.string().max(500_000, "正文过长").optional().transform((v) => v ?? "");

export const WAITING = ["us", "customer", "vendor"] as const;
export const CONFIRM_KIND = ["confirmed_requirement", "suggested_pending"] as const;
export const EVIDENCE_TYPES = ["config_screenshot", "test_record", "customer_confirmation", "other"] as const;
export const STATUSES = ["open", "in_progress", "answered", "pending_customer", "done", "closed"] as const;

export const issueFieldsSchema = z.object({
  meetingBatchId: optId,
  sourceId: optId,
  issueTypeId: optId,
  title: str(300),
  priorityId: z.string().trim().min(1, "请选择优先级"),
  confirmationKind: z.enum(CONFIRM_KIND),
  recordedOn: ymd,
  dueOn: ymd,
  waitingOn: z.enum(WAITING),
  nextAction: str(500),
  reporterContactId: optId,
  reporterText: str(200),
  assigneeIds: z.array(z.string().max(40)).max(30),
  teamAssigned: z.boolean(),
  assigneeText: str(200),
  completionCondition: rich,
  internalNote: rich,
  tags: str(500),
});

export const issueCreateSchema = issueFieldsSchema.extend({
  customerId: optId,
  newCustomerName: str(120),
  problem: rich,
  solution: rich,
});

export type IssueFieldsInput = z.infer<typeof issueFieldsSchema>;
export type IssueCreateInput = z.infer<typeof issueCreateSchema>;

export const customerSchema = z.object({
  name: str(120).min(1, "请填写客户名称"),
  shortName: str(60),
  note: str(2000),
});

export const contactSchema = z.object({
  name: str(80).min(1, "请填写姓名或称谓"),
  title: str(80),
  department: str(80),
  phone: str(60),
  email: str(120),
  note: str(1000),
});

export const meetingSchema = z.object({
  meetingOn: ymd,
  title: str(200),
  updatedOn: ymd,
  updaterText: str(80),
  informationText: str(5000),
  fillingNote: str(5000),
  sourceDocument: str(500),
  divisionNote: str(2000),
});

export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email("邮箱格式不正确").max(200),
  displayName: str(60).min(1, "请填写显示名"),
  aliases: str(300),
  role: z.enum(["admin", "member"]),
});

export const vocabSchema = z.object({
  label: str(30).min(1, "请填写名称"),
  description: str(300),
  color: z
    .string()
    .trim()
    .optional()
    .transform((v) => v ?? "")
    .refine((v) => v === "" || /^#[0-9a-fA-F]{6}$/.test(v), "颜色应为 #RRGGBB"),
  sortOrder: z.coerce.number().int().min(0).max(999),
});

export const settingsSchema = z.object({
  teamName: str(80),
  reminderDueSoonDays: z.coerce.number().int().min(1).max(30),
  reminderPendingDays: z.coerce.number().int().min(1).max(90),
  reminderHighNoDueGraceDays: z.coerce.number().int().min(0).max(30),
  memberCanCreateCustomer: z.boolean(),
  maxImageMb: z.coerce.number().int().min(1).max(50),
  maxAttachmentMb: z.coerce.number().int().min(1).max(100),
  loginMaxFailures: z.coerce.number().int().min(3).max(50),
  loginLockMinutes: z.coerce.number().int().min(1).max(1440),
});

export function splitList(s: string): string[] {
  return [...new Set(s.split(/[,，、;；\n]+/).map((x) => x.trim()).filter(Boolean))];
}

export function firstError(e: z.ZodError): string {
  const i = e.issues[0];
  return i ? i.message : "输入有误";
}
