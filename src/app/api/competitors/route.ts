/**
 * IntelBriefs - Competitive Intelligence (IB-02)
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * CRUD for tracked competitors.
 */

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/session";
import { applyRateLimit } from "@/lib/rateLimit";
import { logActivity } from "@/lib/activity";
import { logger } from "@/lib/logger";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  website: z.string().url().optional(),
  industry: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

// POST /api/competitors — Add a tracked competitor
export async function POST(request: Request) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const competitor = await prisma.competitor.create({
      data: {
        userId: user.id,
        name: parsed.name,
        website: parsed.website,
        industry: parsed.industry,
        description: parsed.description,
        tags: parsed.tags,
      },
    });

    await logActivity({
      userId: user.id,
      type: "created",
      entityType: "competitor",
      entityId: competitor.id,
      entityName: parsed.name,
      description: `Added competitor "${parsed.name}" to tracking`,
    });

    return NextResponse.json({ data: competitor }, { status: 201 });
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
    logger.api.error("POST", "/api/competitors", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// GET /api/competitors — List tracked competitors
export async function GET(request: Request) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();

    const competitors = await prisma.competitor.findMany({
      where: { userId: user.id },
      include: {
        _count: { select: { mentions: true } },
        mentions: {
          orderBy: { detectedAt: "desc" },
          take: 3,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: competitors });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("GET", "/api/competitors", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
