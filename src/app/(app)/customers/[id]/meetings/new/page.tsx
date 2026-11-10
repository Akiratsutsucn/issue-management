import { requireUser } from "@/lib/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import MeetingFields from "@/components/MeetingFields";
import { prisma } from "@/lib/server/db";
import { saveMeetingAction } from "../../../actions";

export default async function NewMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id }, include: { contacts: { orderBy: { name: "asc" } } } });
  if (!customer) notFound();
  const users = await prisma.user.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" } });
  return (
    <main className="page" style={{ maxWidth: 960 }}>
      <div className="crumbs"><Link href="/customers">客户</Link> / <Link href={`/customers/${id}`}>{customer.name}</Link> / 新建会谈</div>
      <div className="page-head"><h1>新建会谈 / 跟进批次</h1></div>
      <div className="card">
        <ActionForm action={saveMeetingAction.bind(null, id, null)} submitLabel="创建" submitClass="btn btn-primary">
          <MeetingFields users={users} contacts={customer.contacts} />
        </ActionForm>
      </div>
    </main>
  );
}
