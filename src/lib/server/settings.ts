import type { TeamSettings } from "@prisma/client";
import { prisma } from "./db";

export async function getSettings(): Promise<TeamSettings> {
  return prisma.teamSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}
