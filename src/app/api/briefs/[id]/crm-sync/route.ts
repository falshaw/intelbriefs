/**
 * IntelBriefs - meeting research briefs
 * Copyright (c) 2024-2026 Nick Falshaw
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { logAudit, getClientIp } from "@/lib/audit";
import { applyRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { pushToCrm } from "@/lib/research/writer";

// POST /api/briefs/[id]/crm-sync — Push to CRM
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const { id } = await params;
    const user = await requireUser();

    const brief = await prisma.brief.findUnique({
      where: { id, userId: user.id },
    });

    if (!brief) {
      return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    }

    if (brief.status !== "COMPLETE") {
      return NextResponse.json(
        { error: "Brief must be complete before CRM sync" },
        { status: 400 },
      );
    }

    const result = await pushToCrm(id);

    if (result.success) {
      await logActivity({
        userId: user.id,
        type: "crm_sync",
        entityType: "brief",
        entityId: id,
        entityName: brief.name,
        description: `Synced brief for "${brief.name}" to CRM (contact: ${result.contactId})`,
      });
    }

    await logAudit({
      userId: user.id,
      action: "brief.crm_sync",
      resource: "brief",
      resourceId: id,
      metadata: {
        name: brief.name,
        success: result.success,
        contactId: result.contactId ?? null,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("POST", "/api/briefs/[id]/crm-sync", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
