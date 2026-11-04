/**
 * IntelBriefs - Competitive Intelligence (IB-02)
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * Single competitor: GET detail, PATCH update, DELETE remove.
 */

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/session";
import { applyRateLimit } from "@/lib/rateLimit";
import { logActivity } from "@/lib/activity";
import { logger } from "@/lib/logger";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  website: z.string().url().optional(),
  industry: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  isActive: z.boolean().optional(),
});

// GET /api/competitors/[id] — Get competitor with mentions
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const { id } = await params;

    const competitor = await prisma.competitor.findFirst({
      where: { id, userId: user.id },
      include: {
        mentions: {
          orderBy: { detectedAt: "desc" },
          take: 50,
        },
        _count: { select: { mentions: true } },
      },
    });

    if (!competitor) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ data: competitor });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("GET", "/api/competitors/[id]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// PATCH /api/competitors/[id] — Update competitor
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await prisma.competitor.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.website !== undefined) data.website = parsed.website;
    if (parsed.industry !== undefined) data.industry = parsed.industry;
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.tags !== undefined) data.tags = parsed.tags;
    if (parsed.isActive !== undefined) data.isActive = parsed.isActive;

    const updated = await prisma.competitor.update({
      where: { id },
      data,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation Error", issues: error.issues },
        { status: 400 },
      );
    }
    logger.api.error("PATCH", "/api/competitors/[id]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// DELETE /api/competitors/[id] — Remove competitor
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const { id } = await params;

    const existing = await prisma.competitor.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.competitor.delete({ where: { id } });

    await logActivity({
      userId: user.id,
      type: "deleted",
      entityType: "competitor",
      entityId: id,
      entityName: existing.name,
      description: `Removed competitor "${existing.name}" from tracking`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("DELETE", "/api/competitors/[id]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
