/**
 * IntelBriefs - Competitive Intelligence Digest (IB-02)
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * Generates a weekly competitive intelligence digest using web search + AI synthesis.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/session";
import { applyRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { logActivity } from "@/lib/activity";
import { logger } from "@/lib/logger";
import { searchWeb } from "@/lib/research/collector";
import { generate } from "@/lib/ollama";

interface DigestEntry {
  competitorId: string;
  competitorName: string;
  mentions: {
    type: string;
    title: string;
    content: string;
    sourceUrl?: string;
    sourceName?: string;
    sentiment: string;
    importance: number;
  }[];
}

// POST /api/competitors/digest — Generate competitive digest
export async function POST(request: Request) {
  const rateLimited = await applyRateLimit(
    request,
    RATE_LIMITS.research,
    "digest",
  );
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();

    // Get all active competitors
    const competitors = await prisma.competitor.findMany({
      where: { userId: user.id, isActive: true },
    });

    if (competitors.length === 0) {
      return NextResponse.json(
        { error: "No active competitors to track" },
        { status: 400 },
      );
    }

    const digestEntries: DigestEntry[] = [];

    // Search for each competitor
    for (const competitor of competitors) {
      try {
        const query = `${competitor.name}${competitor.industry ? ` ${competitor.industry}` : ""} news announcements`;
        const webResult = await searchWeb(query, 5);

        const newMentions: DigestEntry["mentions"] = [];

        for (const result of webResult.results) {
          // Classify the mention using AI
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
            type: "NEWS" as const,
            sentiment: "NEUTRAL" as const,
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
            const parsed = JSON.parse(jsonStr);
            if (parsed && parsed.type) {
              classification = {
                type: parsed.type || "NEWS",
                sentiment: parsed.sentiment || "NEUTRAL",
                importance: Math.min(5, Math.max(1, parsed.importance || 2)),
                summary: parsed.summary || result.title,
              };
            }
          } catch {
            // Use default classification
          }

          // Store the mention
          await prisma.competitorMention.create({
            data: {
              competitorId: competitor.id,
              type: classification.type,
              title: result.title,
              content: classification.summary,
              sourceUrl: result.url,
              sourceName: new URL(result.url).hostname,
              sentiment: classification.sentiment,
              importance: classification.importance,
            },
          });

          newMentions.push({
            type: classification.type,
            title: result.title,
            content: classification.summary,
            sourceUrl: result.url,
            sourceName: new URL(result.url).hostname,
            sentiment: classification.sentiment,
            importance: classification.importance,
          });
        }

        // Update last checked timestamp
        await prisma.competitor.update({
          where: { id: competitor.id },
          data: { lastCheckedAt: new Date() },
        });

        if (newMentions.length > 0) {
          digestEntries.push({
            competitorId: competitor.id,
            competitorName: competitor.name,
            mentions: newMentions,
          });
        }
      } catch (err) {
        logger.warn(`Failed to search for competitor ${competitor.name}`, {
          error: String(err),
        });
      }
    }

    // Generate AI summary of the digest
    let digestSummary = "";
    if (digestEntries.length > 0) {
      const summaryPrompt = `Summarize this competitive intelligence digest for the reader:

${digestEntries
  .map(
    (entry) =>
      `## ${entry.competitorName}
${entry.mentions.map((m) => `- [${m.type}] ${m.title}: ${m.content} (${m.sentiment}, importance: ${m.importance}/5)`).join("\n")}`,
  )
  .join("\n\n")}

Write a 3-5 sentence executive summary highlighting:
1. Most significant competitive moves
2. Potential threats or opportunities
3. Recommended actions

Keep it focused on actionable intelligence.`;

      try {
        digestSummary = await generate(summaryPrompt);
      } catch {
        digestSummary =
          "AI digest summary unavailable. Review individual mentions below.";
      }
    }

    await logActivity({
      userId: user.id,
      type: "generated",
      entityType: "competitive_digest",
      description: `Generated competitive digest for ${competitors.length} competitor(s), found ${digestEntries.reduce((sum, e) => sum + e.mentions.length, 0)} mention(s)`,
    });

    return NextResponse.json({
      data: {
        summary: digestSummary,
        entries: digestEntries,
        competitorsChecked: competitors.length,
        totalMentions: digestEntries.reduce(
          (sum, e) => sum + e.mentions.length,
          0,
        ),
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("POST", "/api/competitors/digest", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
