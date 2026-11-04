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

// GET /api/briefs/[id] — Get single brief with sources
export async function GET(
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
      include: { sources: true },
    });

    if (!brief) {
      return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    }

    return NextResponse.json(brief);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("GET", "/api/briefs/[id]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// DELETE /api/briefs/[id] — Delete brief
export async function DELETE(
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

    await prisma.brief.delete({ where: { id } });

    await logActivity({
      userId: user.id,
      type: "deleted",
      entityType: "brief",
      entityId: id,
      entityName: brief.name,
      description: `Deleted brief for "${brief.name}"`,
    });

    await logAudit({
      userId: user.id,
      action: "brief.delete",
      resource: "brief",
      resourceId: id,
      metadata: { name: brief.name, type: brief.type, mode: brief.mode },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("DELETE", "/api/briefs/[id]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
