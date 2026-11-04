/**
 * IntelBriefs - Intelligence Briefing System
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * POST /api/watchlist/[id]/run — Manual Run Trigger (IB-01)
 *
 * Triggers an immediate research run for a single watchlist item.
 * Same logic as the cron runner but for on-demand execution.
 * Returns the new brief ID so the UI can redirect or poll.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/session";
import { applyRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { logActivity } from "@/lib/activity";
import { logger } from "@/lib/logger";
import { createAndRunBrief } from "@/lib/research/pipeline";
import { getNextRunAt } from "@/app/api/watchlist/route";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(
    request,
    RATE_LIMITS.research,
    "watchlist_run",
  );
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const { id } = await params;

    // Verify ownership
    const item = await prisma.watchlistItem.findFirst({
      where: { id, userId: user.id },
    });
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get previous run for delta comparison
    const lastRun = await prisma.watchlistRun.findFirst({
      where: { watchlistItemId: id },
      orderBy: { createdAt: "desc" },
      include: {
        brief: {
          select: { summary: true, talkingPoints: true, riskSignals: true },
        },
      },
    });

    // Build input and trigger research
    const input = item.company ? `${item.name} ${item.company}` : item.name;
    const briefId = await createAndRunBrief(input, item.briefMode, user.id);

    // Create WatchlistRun record (delta computed after brief completes, or by UI)
    const run = await prisma.watchlistRun.create({
      data: {
        watchlistItemId: id,
        briefId,
        changedFields: [],
        previousSummary: lastRun?.brief.summary || null,
      },
    });

    // Update watchlist item timing
    await prisma.watchlistItem.update({
      where: { id },
      data: {
        lastRunAt: new Date(),
        nextRunAt: getNextRunAt(item.frequency),
      },
    });

    // Activity log (fire-and-forget)
    logActivity({
      userId: user.id,
      type: "watchlist_manual_run",
      entityType: "watchlist",
      entityId: id,
      entityName: item.name,
      description: `Manual watchlist run triggered for "${item.name}"`,
    }).catch((e) => console.error("Activity log failed:", e));

    logger.info("Watchlist manual run triggered", {
      itemId: id,
      briefId,
      name: item.name,
    });

    return NextResponse.json(
      { data: { runId: run.id, briefId } },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("POST", "/api/watchlist/[id]/run", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
