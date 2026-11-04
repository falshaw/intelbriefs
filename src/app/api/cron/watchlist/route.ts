/**
 * IntelBriefs - Intelligence Briefing System
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * GET /api/cron/watchlist — Recurring Watchlist Brief Runner (IB-01)
 *
 * Runs on schedule (external cron or container healthcheck).
 * Finds all active WatchlistItems due for a run, triggers research pipeline,
 * creates WatchlistRun records with delta detection, and advances nextRunAt.
 *
 * Auth: CRON_SECRET header check.
 * Max 5 items per cron run to avoid pipeline overload.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { createAndRunBrief } from "@/lib/research/pipeline";
import { getNextRunAt } from "@/app/api/watchlist/route";

/** Max items to process per cron run */
const MAX_PER_RUN = 5;

/**
 * Compare two briefs and return which sections changed.
 * Compares: summary, talkingPoints, riskSignals.
 */
function detectChanges(
  previous: {
    summary: string | null;
    talkingPoints: string[];
    riskSignals: string[];
  } | null,
  current: {
    summary: string | null;
    talkingPoints: string[];
    riskSignals: string[];
  },
): string[] {
  if (!previous) return [];

  const changed: string[] = [];

  // Summary comparison — normalize whitespace and compare
  const prevSummary = (previous.summary || "").trim();
  const currSummary = (current.summary || "").trim();
  if (prevSummary !== currSummary) {
    changed.push("summary");
  }

  // Talking points comparison — compare as sorted sets
  const prevTP = [...previous.talkingPoints].sort();
  const currTP = [...current.talkingPoints].sort();
  if (
    prevTP.length !== currTP.length ||
    prevTP.some((v, i) => v !== currTP[i])
  ) {
    changed.push("talkingPoints");
  }

  // Risk signals comparison — compare as sorted sets
  const prevRS = [...previous.riskSignals].sort();
  const currRS = [...current.riskSignals].sort();
  if (
    prevRS.length !== currRS.length ||
    prevRS.some((v, i) => v !== currRS[i])
  ) {
    changed.push("riskSignals");
  }

  return changed;
}

export async function GET(request: Request) {
  try {
    // 1. Auth check via CRON_SECRET (fail-closed: reject if not configured)
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: "CRON_SECRET not configured" },
        { status: 503 },
      );
    }
    const provided =
      request.headers.get("x-cron-secret") ||
      request.headers.get("Authorization")?.replace("Bearer ", "");
    if (provided !== cronSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    logger.api.request("GET", "/api/cron/watchlist", {});

    const now = new Date();

    // 2. Find all active items due for a run
    const dueItems = await prisma.watchlistItem.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
      },
      include: {
        runs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            brief: {
              select: {
                summary: true,
                talkingPoints: true,
                riskSignals: true,
              },
            },
          },
        },
      },
      take: MAX_PER_RUN,
      orderBy: { nextRunAt: "asc" },
    });

    if (dueItems.length === 0) {
      return NextResponse.json({
        processed: 0,
        briefs_created: 0,
        changes_detected: 0,
        message: "No watchlist items due for processing",
      });
    }

    let briefsCreated = 0;
    let changesDetected = 0;
    const results: {
      itemId: string;
      name: string;
      briefId: string;
      changedFields: string[];
    }[] = [];

    // 3. Process each due item
    for (const item of dueItems) {
      try {
        const lastRun = item.runs[0] || null;
        const previousBrief = lastRun?.brief || null;

        // Build input string for the pipeline
        const input = item.company ? `${item.name} ${item.company}` : item.name;

        // Run research pipeline
        const briefId = await createAndRunBrief(
          input,
          item.briefMode,
          item.userId,
        );
        briefsCreated++;

        // Wait briefly for the brief to start processing, then fetch it
        // The pipeline runs async, so we create the run record with empty changes
        // and will update when the brief completes. For the cron, we store the
        // previous summary so the UI can compute deltas later.
        const changedFields: string[] = [];

        // Try to detect changes if the new brief has already completed
        // (quick briefs may finish fast enough)
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const newBrief = await prisma.brief.findUnique({
          where: { id: briefId },
          select: {
            summary: true,
            talkingPoints: true,
            riskSignals: true,
            status: true,
          },
        });

        if (newBrief && newBrief.status === "COMPLETE" && previousBrief) {
          const detected = detectChanges(previousBrief, newBrief);
          changedFields.push(...detected);
          if (detected.length > 0) changesDetected++;
        }

        // Create WatchlistRun record
        await prisma.watchlistRun.create({
          data: {
            watchlistItemId: item.id,
            briefId,
            changedFields,
            previousSummary: previousBrief?.summary || null,
          },
        });

        // Advance nextRunAt
        await prisma.watchlistItem.update({
          where: { id: item.id },
          data: {
            lastRunAt: now,
            nextRunAt: getNextRunAt(item.frequency),
          },
        });

        // Activity + audit logging (fire-and-forget)
        logActivity({
          userId: item.userId,
          type: "watchlist_cron_run",
          entityType: "watchlist",
          entityId: item.id,
          entityName: item.name,
          description: `Cron ran watchlist brief for "${item.name}"${changedFields.length > 0 ? ` (changes: ${changedFields.join(", ")})` : ""}`,
        }).catch((e) => console.error("Watchlist activity log failed:", e));

        logAudit({
          userId: item.userId,
          action: "watchlist.cron_run",
          resource: "watchlist",
          resourceId: item.id,
          metadata: {
            briefId,
            name: item.name,
            company: item.company,
            frequency: item.frequency,
            changedFields,
          },
        }).catch((e) => console.error("Watchlist audit log failed:", e));

        results.push({
          itemId: item.id,
          name: item.name,
          briefId,
          changedFields,
        });
      } catch (err) {
        logger.warn("Cron watchlist run failed for item", {
          itemId: item.id,
          name: item.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const response = {
      processed: dueItems.length,
      briefs_created: briefsCreated,
      changes_detected: changesDetected,
      results,
    };

    logger.info("Cron watchlist run complete", response);
    return NextResponse.json(response);
  } catch (error) {
    logger.api.error("GET", "/api/cron/watchlist", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
