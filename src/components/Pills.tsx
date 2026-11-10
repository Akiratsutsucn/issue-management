import { CONFIRM_SHORT, WAITING_LABEL } from "@/lib/labels";
import { STATUS_COLOR, STATUS_LABEL, type IssueStatus } from "@/lib/status";

export function Dot({ color }: { color?: string | null }) {
  return <span className="dot" style={{ background: color ?? "#B4AFA8" }} aria-hidden />;
}

export function StatusPill({ status }: { status: IssueStatus }) {
  return (
    <span className="pill">
      <Dot color={STATUS_COLOR[status]} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityPill({ p }: { p: { label: string; color: string | null } }) {
  return (
    <span className="pill">
      <Dot color={p.color} />
      {p.label}
    </span>
  );
}

export function ConfirmTag({ kind }: { kind: keyof typeof CONFIRM_SHORT }) {
  return <span className={`tag ${kind === "confirmed_requirement" ? "tag-sage" : "tag-apricot"}`}>{CONFIRM_SHORT[kind]}</span>;
}

export function WaitingText({ w }: { w: keyof typeof WAITING_LABEL }) {
  return <>{WAITING_LABEL[w]}</>;
}

export function Dash({ v }: { v: React.ReactNode }) {
  return <>{v === null || v === undefined || v === "" ? "—" : v}</>;
}

export function TitleText({ title }: { title: string }) {
  return title ? <>{title}</> : <span className="tag tag-draft">标题待补</span>;
}
