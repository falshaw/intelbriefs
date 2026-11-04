/**
 * IntelBriefs - meeting research briefs
 * Copyright (c) 2024-2026 Nick Falshaw
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { logAudit, getClientIp } from "@/lib/audit";
import { applyRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { runQuickPipeline, runDeepPipeline } from "@/lib/research/pipeline";

// POST /api/briefs/[id]/refresh — Re-run research
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(
    request,
    RATE_LIMITS.research,
    "refresh",
  );
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

    // Reset brief status and clear old sources
    await prisma.source.deleteMany({ where: { briefId: id } });
    await prisma.brief.update({
      where: { id },
      data: {
        status: "PENDING",
        summary: null,
        talkingPoints: [],
        riskSignals: [],
        strategy: null,
        webFindings: undefined,
        crmFindings: undefined,
        localFindings: undefined,
        crmSynced: false,
      },
    });

    // Run pipeline
    const pipelineFn =
      brief.mode === "QUICK" ? runQuickPipeline : runDeepPipeline;
    pipelineFn(id).catch((err) => logger.research.error(id, err));

    await logActivity({
      userId: user.id,
      type: "refreshed",
      entityType: "brief",
      entityId: id,
      entityName: brief.name,
      description: `Refreshed ${brief.mode} brief for "${brief.name}"`,
    });

    await logAudit({
      userId: user.id,
      action: "brief.refresh",
      resource: "brief",
      resourceId: id,
      metadata: { name: brief.name, mode: brief.mode },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true, briefId: id });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("POST", "/api/briefs/[id]/refresh", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
