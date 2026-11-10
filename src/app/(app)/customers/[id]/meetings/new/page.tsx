import { requireUser } from "@/lib/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import MeetingFields from "@/components/MeetingFields";
import { prisma } from "@/lib/server/db";
import { saveMeetingAction } from "../../../actions";

export default async function NewMeetingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ project?: string }> }) {
  await requireUser();
  const { id } = await params;
  const { project } = await searchParams;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { contacts: { orderBy: { name: "asc" } }, projects: { where: { status: "active" }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } } },
  });
  if (!customer) notFound();
  const users = await prisma.user.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" } });
  return (
    <main className="page" style={{ maxWidth: 960 }}>
      <div className="crumbs"><Link href="/customers">客户</Link> / <Link href={`/customers/${id}`}>{customer.name}</Link> / 新建会谈</div>
      <div className="page-head"><h1>新建会谈 / 跟进批次</h1></div>
      <div className="card">
        <ActionForm action={saveMeetingAction.bind(null, id, null)} submitLabel="创建" submitClass="btn btn-primary">
          <MeetingFields users={users} contacts={customer.contacts} projects={customer.projects} defaultProjectId={project} />
        </ActionForm>
      </div>
    </main>
  );
}
