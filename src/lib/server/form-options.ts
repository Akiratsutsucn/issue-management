import { prisma } from "./db";

/** 课题表单选项。归档客户默认隐藏，除非就是当前课题的客户 */
export async function issueFormOptions(includeCustomerId?: string) {
  const [customers, priorities, types, sources, users, settings] = await Promise.all([
    prisma.customer.findMany({
      where: { OR: [{ status: "active" }, ...(includeCustomerId ? [{ id: includeCustomerId }] : [])] },
      orderBy: { name: "asc" },
      include: {
        contacts: { orderBy: { name: "asc" }, select: { id: true, name: true } },
        meetings: { orderBy: [{ meetingOn: "desc" }, { createdAt: "desc" }], select: { id: true, title: true } },
      },
    }),
    prisma.priority.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.issueType.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.source.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" } }),
    prisma.teamSettings.findUnique({ where: { id: 1 } }),
  ]);
  return {
    customers: customers.map((c) => ({ id: c.id, name: c.name, contacts: c.contacts, batches: c.meetings })),
    priorities: priorities.map((p) => ({ id: p.id, label: p.label, key: p.key })),
    types: types.map((t) => ({ id: t.id, label: t.label })),
    sources: sources.map((t) => ({ id: t.id, label: t.label })),
    users: users.map((u) => ({ id: u.id, label: u.displayName })),
    memberCanCreateCustomer: settings?.memberCanCreateCustomer ?? true,
  };
}
