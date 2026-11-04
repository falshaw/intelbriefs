/**
 * IntelBriefs - Competitive Intelligence Scan (IB-02)
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * Trigger a web scan for a single competitor or all active competitors.
 * Uses the existing research pipeline (Tavily) to search for competitor news.
 */

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/session";
import { applyRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { logActivity } from "@/lib/activity";
import { logger } from "@/lib/logger";
import { searchWeb } from "@/lib/research/collector";
import { generate } from "@/lib/ollama";

const scanSchema = z.object({
  competitorId: z.string().optional(),
});

// POST /api/competitors/scan — Scan single or all competitors for new mentions
export async function POST(request: Request) {
  const rateLimited = await applyRateLimit(
    request,
    RATE_LIMITS.research,
    "competitor-scan",
  );
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const parsed = scanSchema.parse(body);

    // Get target competitors
    const where: Record<string, unknown> = { userId: user.id, isActive: true };
    if (parsed.competitorId) {
      where.id = parsed.competitorId;
    }

    const competitors = await prisma.competitor.findMany({ where });

    if (competitors.length === 0) {
      return NextResponse.json(
        {
          error: parsed.competitorId
            ? "Competitor not found"
            : "No active competitors",
        },
        { status: 404 },
      );
    }

    const results: {
      competitorId: string;
      competitorName: string;
      newMentions: number;
      mentions: {
        type: string;
        title: string;
        content: string;
        sourceUrl: string;
        sentiment: string;
        importance: number;
      }[];
    }[] = [];

    for (const competitor of competitors) {
      try {
        const query = `"${competitor.name}"${competitor.industry ? ` ${competitor.industry}` : ""} latest news announcements updates`;
        const webResult = await searchWeb(query, 5);

        const newMentions: (typeof results)[0]["mentions"] = [];

        for (const result of webResult.results) {
          // Classify using AI
          const classifyPrompt = `Classify this news about "${competitor.name}":
Title: ${result.title}
Content: ${result.content?.slice(0, 500) || ""}

Return JSON with:
- type: one of PRODUCT_LAUNCH, PRICING_CHANGE, PARTNERSHIP, HIRING, FUNDING, NEWS, SOCIAL_MEDIA, OTHER
- sentiment: one of POSITIVE, NEGATIVE, NEUTRAL
- importance: 1-5 (5 = critical competitive impact)
- summary: 1-2 sentence summary of competitive relevance

Return ONLY valid JSON.`;

          let classification = {
            type: "NEWS" as string,
            sentiment: "NEUTRAL" as string,
            importance: 2,
            summary: result.content?.slice(0, 200) || result.title,
          };

          try {
            const aiResult = await generate(classifyPrompt);
            const codeBlockMatch = aiResult.match(
              /```(?:json)?\s*([\s\S]*?)```/,
            );
            const jsonStr = codeBlockMatch
              ? codeBlockMatch[1].trim()
              : aiResult.trim();
            const aiParsed = JSON.parse(jsonStr);
            if (aiParsed && aiParsed.type) {
              classification = {
                type: aiParsed.type || "NEWS",
                sentiment: aiParsed.sentiment || "NEUTRAL",
                importance: Math.min(5, Math.max(1, aiParsed.importance || 2)),
                summary: aiParsed.summary || result.title,
              };
            }
          } catch {
            // Use default classification
          }

          // Validate enum values
          const validTypes = [
            "PRODUCT_LAUNCH",
            "PRICING_CHANGE",
            "PARTNERSHIP",
            "HIRING",
            "FUNDING",
            "NEWS",
            "SOCIAL_MEDIA",
            "OTHER",
          ];
          const validSentiments = ["POSITIVE", "NEGATIVE", "NEUTRAL"];
          const mentionType = validTypes.includes(classification.type)
            ? classification.type
            : "NEWS";
          const mentionSentiment = validSentiments.includes(
            classification.sentiment,
          )
            ? classification.sentiment
            : "NEUTRAL";

          let sourceName = "";
          try {
            sourceName = new URL(result.url).hostname;
          } catch {
            sourceName = "unknown";
          }

          await prisma.competitorMention.create({
            data: {
              competitorId: competitor.id,
              type: mentionType as
                | "PRODUCT_LAUNCH"
                | "PRICING_CHANGE"
                | "PARTNERSHIP"
                | "HIRING"
                | "FUNDING"
                | "NEWS"
                | "SOCIAL_MEDIA"
                | "OTHER",
              title: result.title,
              content: classification.summary,
              sourceUrl: result.url,
              sourceName,
              sentiment: mentionSentiment as
                | "POSITIVE"
                | "NEGATIVE"
                | "NEUTRAL",
              importance: classification.importance,
            },
          });

          newMentions.push({
            type: mentionType,
            title: result.title,
            content: classification.summary,
            sourceUrl: result.url,
            sentiment: mentionSentiment,
            importance: classification.importance,
          });
        }

        // Update last checked timestamp
        await prisma.competitor.update({
          where: { id: competitor.id },
          data: { lastCheckedAt: new Date() },
        });

        results.push({
          competitorId: competitor.id,
          competitorName: competitor.name,
          newMentions: newMentions.length,
          mentions: newMentions,
        });
      } catch (err) {
        logger.warn(`Scan failed for competitor ${competitor.name}`, {
          error: String(err),
        });
        results.push({
          competitorId: competitor.id,
          competitorName: competitor.name,
          newMentions: 0,
          mentions: [],
        });
      }
    }

    const totalMentions = results.reduce((sum, r) => sum + r.newMentions, 0);

    await logActivity({
      userId: user.id,
      type: "scanned",
      entityType: "competitor",
      entityId: parsed.competitorId,
      description: `Scanned ${competitors.length} competitor(s), found ${totalMentions} new mention(s)`,
    });

    return NextResponse.json({
      data: {
        scannedCount: competitors.length,
        totalNewMentions: totalMentions,
        results,
        scannedAt: new Date().toISOString(),
      },
    });
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
    logger.api.error("POST", "/api/competitors/scan", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
