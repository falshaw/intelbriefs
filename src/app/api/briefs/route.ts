/**
 * IntelBriefs - meeting research briefs
 * Copyright (c) 2024-2026 Nick Falshaw
 */

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { logAudit, getClientIp } from "@/lib/audit";
import { applyRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { createAndRunBrief } from "@/lib/research/pipeline";
import type { BriefStatus, BriefType, BriefMode } from "@prisma/client";

const createBriefSchema = z.object({
  input: z.string().min(2).max(200),
  mode: z.enum(["QUICK", "DEEP"]).default("QUICK"),
  name: z.string().min(1).max(200).optional(),
  company: z.string().max(200).optional(),
  linkedinUrl: z.string().url().optional(),
  context: z.string().max(500).optional(),
});

// POST /api/briefs — Create and trigger research
export async function POST(request: Request) {
  const rateLimited = await applyRateLimit(
    request,
    RATE_LIMITS.research,
    "briefs",
  );
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = createBriefSchema.parse(body);

    logger.api.request("POST", "/api/briefs", {
      input: parsed.input,
      mode: parsed.mode,
    });

    const briefId = await createAndRunBrief(parsed.input, parsed.mode, user.id);

    await logActivity({
      userId: user.id,
      type: "created",
      entityType: "brief",
      entityId: briefId,
      entityName: parsed.input,
      description: `Created ${parsed.mode} brief for "${parsed.input}"`,
    });

    await logAudit({
      userId: user.id,
      action: "brief.create",
      resource: "brief",
      resourceId: briefId,
      metadata: { input: parsed.input, mode: parsed.mode },
      ipAddress: getClientIp(request),
    });

    // Return immediately with 202 Accepted — client polls GET /api/briefs/[id]
    const brief = await prisma.brief.findUnique({
      where: { id: briefId },
      include: { sources: true },
    });
    return NextResponse.json(brief, { status: 202 });
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
    logger.api.error("POST", "/api/briefs", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// GET /api/briefs — List briefs (paginated)
export async function GET(request: Request) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") || "20")),
    );
    const type = searchParams.get("type") as BriefType | null;
    const mode = searchParams.get("mode") as BriefMode | null;
    const status = searchParams.get("status") as BriefStatus | null;
    const search = searchParams.get("search");

    const where = {
      userId: user.id,
      ...(type && { type }),
      ...(mode && { mode }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { company: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [briefs, total] = await Promise.all([
      prisma.brief.findMany({
        where,
        include: { _count: { select: { sources: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.brief.count({ where }),
    ]);

    return NextResponse.json({
      data: briefs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("GET", "/api/briefs", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
