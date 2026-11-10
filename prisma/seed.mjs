// 种子：仅词汇表、默认设置、可选管理员。零客户、零会谈、零课题。
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PRIORITIES = [
  { key: "high", label: "高", description: "安全、数据恢复或账号整合等前置事项", color: "#E8898A", sortOrder: 1 },
  { key: "medium", label: "中", description: "功能控制、流程与可行性评估", color: "#E8B86D", sortOrder: 2 },
  { key: "low", label: "低", description: "体验优化", color: "#7CB8A2", sortOrder: 3 },
];
const TYPES = ["咨询", "故障", "需求", "采购", "实施", "变更", "其他"];
const SOURCES = ["会谈", "邮件", "企微", "电话", "其他"];
const TYPE_KEYS = ["consult", "incident", "requirement", "purchase", "implementation", "change", "other"];
const SOURCE_KEYS = ["meeting", "email", "wecom", "phone", "other"];

async function main() {
  for (const p of PRIORITIES) {
    await prisma.priority.upsert({ where: { key: p.key }, update: {}, create: p });
  }
  for (const [i, label] of TYPES.entries()) {
    await prisma.issueType.upsert({ where: { key: TYPE_KEYS[i] }, update: {}, create: { key: TYPE_KEYS[i], label, sortOrder: i + 1 } });
  }
  for (const [i, label] of SOURCES.entries()) {
    await prisma.source.upsert({ where: { key: SOURCE_KEYS[i] }, update: {}, create: { key: SOURCE_KEYS[i], label, sortOrder: i + 1 } });
  }
  await prisma.teamSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const adminCount = await prisma.user.count({ where: { role: "admin" } });
  if (adminCount === 0 && email && password) {
    if (password.length < 10) throw new Error("SEED_ADMIN_PASSWORD 至少 10 位");
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { email, passwordHash, displayName: "管理员", role: "admin" } });
    await prisma.auditLog.create({
      data: { entityType: "user", entityId: user.id, action: "seed_admin", summary: `初始化管理员 ${email}` },
    });
    console.log(`[seed] 已创建管理员 ${email}`);
  } else if (adminCount === 0) {
    console.log("[seed] 未设置 SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD，未创建管理员");
  }
  console.log("[seed] 词汇表与默认设置就绪");
}

main()
  .catch((e) => {
    console.error("[seed] 失败:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
