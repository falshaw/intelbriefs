/**
 * IntelBriefs - Source Quality Statistics (IB-05)
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * Aggregated quality metrics across all briefs and sources.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/session";
import { applyRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

interface DomainStats {
  domain: string;
  timesUsed: number;
  avgScore: number;
  category: string;
}

// GET /api/sources/stats — Aggregated source quality metrics
export async function GET(request: Request) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();

    // Get all sources from user's briefs with credibility scores
    const briefs = await prisma.brief.findMany({
      where: { userId: user.id, status: "COMPLETE" },
      select: { id: true },
    });

    const briefIds = briefs.map((b) => b.id);

    const sources =
      briefIds.length > 0
        ? await prisma.source.findMany({
            where: {
              briefId: { in: briefIds },
              credibilityScore: { not: null },
            },
            select: {
              url: true,
              type: true,
              credibilityScore: true,
            },
          })
        : [];

    // Aggregate by domain
    const domainMap = new Map<
      string,
      { count: number; totalScore: number; scores: number[] }
    >();

    for (const source of sources) {
      if (!source.url || source.credibilityScore === null) continue;

      let domain: string;
      try {
        domain = new URL(source.url).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }

      const existing = domainMap.get(domain);
      if (existing) {
        existing.count++;
        existing.totalScore += source.credibilityScore;
        existing.scores.push(source.credibilityScore);
      } else {
        domainMap.set(domain, {
          count: 1,
          totalScore: source.credibilityScore,
          scores: [source.credibilityScore],
        });
      }
    }

    // Build domain stats sorted by usage
    const domainStats: DomainStats[] = [];
    for (const [domain, data] of domainMap.entries()) {
      const avgScore = data.totalScore / data.count;
      let category: string;
      if (avgScore >= 0.9) category = "Tier 1 (Academic/Gov)";
      else if (avgScore >= 0.7) category = "Tier 2 (Established)";
      else if (avgScore >= 0.5) category = "Tier 3 (Blog/Industry)";
      else category = "Tier 4 (Forum/Social)";

      domainStats.push({
        domain,
        timesUsed: data.count,
        avgScore: Math.round(avgScore * 100) / 100,
        category,
      });
    }

    domainStats.sort((a, b) => b.timesUsed - a.timesUsed);

    // Category breakdown
    const categoryBreakdown: Record<
      string,
      { count: number; avgScore: number }
    > = {};
    for (const source of sources) {
      if (source.credibilityScore === null) continue;
      let category: string;
      if (source.credibilityScore >= 0.9) category = "Tier 1";
      else if (source.credibilityScore >= 0.7) category = "Tier 2";
      else if (source.credibilityScore >= 0.5) category = "Tier 3";
      else category = "Tier 4";

      if (!categoryBreakdown[category]) {
        categoryBreakdown[category] = { count: 0, avgScore: 0 };
      }
      categoryBreakdown[category].count++;
      categoryBreakdown[category].avgScore += source.credibilityScore;
    }

    for (const key of Object.keys(categoryBreakdown)) {
      const cat = categoryBreakdown[key];
      cat.avgScore =
        cat.count > 0 ? Math.round((cat.avgScore / cat.count) * 100) / 100 : 0;
    }

    // Type breakdown (WEB, CRM, LOCAL_FILE, LINKEDIN)
    const typeBreakdown: Record<string, { count: number; avgScore: number }> =
      {};
    for (const source of sources) {
      if (source.credibilityScore === null) continue;
      if (!typeBreakdown[source.type]) {
        typeBreakdown[source.type] = { count: 0, avgScore: 0 };
      }
      typeBreakdown[source.type].count++;
      typeBreakdown[source.type].avgScore += source.credibilityScore;
    }

    for (const key of Object.keys(typeBreakdown)) {
      const entry = typeBreakdown[key];
      entry.avgScore =
        entry.count > 0
          ? Math.round((entry.avgScore / entry.count) * 100) / 100
          : 0;
    }

    // Overall stats
    const totalSources = sources.length;
    const scoredSources = sources.filter(
      (s) => s.credibilityScore !== null,
    ).length;
    const avgOverallScore =
      scoredSources > 0
        ? Math.round(
            (sources.reduce((sum, s) => sum + (s.credibilityScore || 0), 0) /
              scoredSources) *
              100,
          ) / 100
        : 0;

    // User overrides count
    const userOverrides = await prisma.sourceScore.count({
      where: { userId: user.id },
    });

    return NextResponse.json({
      data: {
        overview: {
          totalBriefs: briefs.length,
          totalSources,
          scoredSources,
          avgOverallScore,
          uniqueDomains: domainMap.size,
          userOverrides,
        },
        categoryBreakdown,
        typeBreakdown,
        topDomains: domainStats.slice(0, 20),
        allDomains: domainStats,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("GET", "/api/sources/stats", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
