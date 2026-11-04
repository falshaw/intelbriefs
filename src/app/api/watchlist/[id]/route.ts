/**
 * IntelBriefs — Single Watchlist Item API (IB-01)
 * Update, delete, trigger manual run, view history.
 */

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/session";
import { applyRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { createAndRunBrief } from "@/lib/research/pipeline";
import { getNextRunAt } from "../route";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  company: z.string().max(200).optional(),
  frequency: z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
  briefMode: z.enum(["QUICK", "DEEP"]).optional(),
  isActive: z.boolean().optional(),
});

// GET /api/watchlist/[id] — Get item with run history
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const { id } = await params;

    const item = await prisma.watchlistItem.findFirst({
      where: { id, userId: user.id },
      include: {
        runs: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            brief: {
              select: {
                id: true,
                status: true,
                summary: true,
                talkingPoints: true,
                riskSignals: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ data: item });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("GET", "/api/watchlist/[id]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// PATCH /api/watchlist/[id] — Update item
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

    const existing = await prisma.watchlistItem.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.company !== undefined) data.company = parsed.company;
    if (parsed.briefMode !== undefined) data.briefMode = parsed.briefMode;
    if (parsed.isActive !== undefined) data.isActive = parsed.isActive;
    if (parsed.frequency !== undefined) {
      data.frequency = parsed.frequency;
      data.nextRunAt = getNextRunAt(parsed.frequency);
    }

    const updated = await prisma.watchlistItem.update({
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
    logger.api.error("PATCH", "/api/watchlist/[id]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// DELETE /api/watchlist/[id] — Remove from watchlist
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const { id } = await params;

    const existing = await prisma.watchlistItem.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.watchlistItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("DELETE", "/api/watchlist/[id]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// POST /api/watchlist/[id] — Trigger manual run now
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const { id } = await params;

    const item = await prisma.watchlistItem.findFirst({
      where: { id, userId: user.id },
    });
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get previous brief for delta comparison
    const lastRun = await prisma.watchlistRun.findFirst({
      where: { watchlistItemId: id },
      orderBy: { createdAt: "desc" },
      include: {
        brief: {
          select: { summary: true, talkingPoints: true, riskSignals: true },
        },
      },
    });

    // Create new brief
    const input = item.company ? `${item.name} ${item.company}` : item.name;
    const briefId = await createAndRunBrief(input, item.briefMode, user.id);

    // Create watchlist run record (delta computed after brief completes)
    const changedFields: string[] = [];
    const run = await prisma.watchlistRun.create({
      data: {
        watchlistItemId: id,
        briefId,
        changedFields,
        previousSummary: lastRun?.brief.summary,
      },
    });

    // Update next run time
    await prisma.watchlistItem.update({
      where: { id },
      data: {
        lastRunAt: new Date(),
        nextRunAt: getNextRunAt(item.frequency),
      },
    });

    return NextResponse.json({ data: { run, briefId } }, { status: 202 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("POST", "/api/watchlist/[id]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
