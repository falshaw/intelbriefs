/**
 * IntelBriefs - Competitive Intelligence (IB-02)
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * Manage competitor mentions — manual add and list.
 */

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/session";
import { applyRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

const createMentionSchema = z.object({
  type: z.enum([
    "PRODUCT_LAUNCH",
    "PRICING_CHANGE",
    "PARTNERSHIP",
    "HIRING",
    "FUNDING",
    "NEWS",
    "SOCIAL_MEDIA",
    "OTHER",
  ]),
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(5000),
  sourceUrl: z.string().url().optional(),
  sourceName: z.string().max(200).optional(),
  sentiment: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]).default("NEUTRAL"),
  importance: z.number().int().min(1).max(5).default(3),
});

// POST /api/competitors/[id]/mentions — Add mention
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json();
    const parsed = createMentionSchema.parse(body);

    // Verify ownership
    const competitor = await prisma.competitor.findFirst({
      where: { id, userId: user.id },
    });
    if (!competitor) {
      return NextResponse.json(
        { error: "Competitor not found" },
        { status: 404 },
      );
    }

    const mention = await prisma.competitorMention.create({
      data: {
        competitorId: id,
        type: parsed.type,
        title: parsed.title,
        content: parsed.content,
        sourceUrl: parsed.sourceUrl,
        sourceName: parsed.sourceName,
        sentiment: parsed.sentiment,
        importance: parsed.importance,
      },
    });

    return NextResponse.json({ data: mention }, { status: 201 });
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
    logger.api.error("POST", "/api/competitors/[id]/mentions", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// GET /api/competitors/[id]/mentions — List mentions with filtering
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "50")),
    );

    // Verify ownership
    const competitor = await prisma.competitor.findFirst({
      where: { id, userId: user.id },
    });
    if (!competitor) {
      return NextResponse.json(
        { error: "Competitor not found" },
        { status: 404 },
      );
    }

    const where: Record<string, unknown> = { competitorId: id };
    if (type) where.type = type;

    const mentions = await prisma.competitorMention.findMany({
      where,
      orderBy: { detectedAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ data: mentions });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("GET", "/api/competitors/[id]/mentions", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
