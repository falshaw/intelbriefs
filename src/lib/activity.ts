/**
 * IntelBriefs - Personal Intelligence Briefing
 * Copyright (c) 2024-2026 Nick Falshaw
 */

import { prisma } from "./prisma";

interface LogActivityParams {
  userId: string;
  type: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  description: string;
}

export async function logActivity(params: LogActivityParams) {
  return prisma.activity.create({ data: params });
}
