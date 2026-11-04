/**
 * IntelBriefs - Brief Template Generation (IB-04)
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * Generate a full brief from a template by running each section's prompt
 * against web research + AI synthesis.
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
import { getScoreForUrl } from "@/app/api/sources/scores/route";
import type { SourceType } from "@prisma/client";

const generateSchema = z.object({
  input: z.string().min(2).max(200),
  company: z.string().max(200).optional(),
  context: z.string().max(500).optional(),
});

interface TemplateSection {
  key: string;
  label: string;
  prompt: string;
  order: number;
}

// POST /api/templates/[id]/generate — Generate brief from template
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(
    request,
    RATE_LIMITS.research,
    "template-generate",
  );
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json();
    const parsed = generateSchema.parse(body);

    // Load template
    const template = await prisma.briefTemplate.findFirst({
      where: { id, userId: user.id },
    });
    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    }

    const sections = (template.sections as unknown as TemplateSection[]).sort(
      (a, b) => a.order - b.order,
    );

    // Create the brief record
    const brief = await prisma.brief.create({
      data: {
        type: parsed.company ? "COMPANY" : "PERSON",
        mode: "DEEP",
        status: "PENDING",
        name: parsed.input,
        company: parsed.company,
        context: parsed.context || `Generated from template: ${template.name}`,
        userId: user.id,
      },
    });

    // Run async — return 202 immediately
    runTemplateGeneration(
      brief.id,
      parsed.input,
      parsed.company,
      sections,
      user.id,
    ).catch((err) =>
      logger.warn("Template generation failed", {
        error: String(err),
        briefId: brief.id,
      }),
    );

    const createdBrief = await prisma.brief.findUnique({
      where: { id: brief.id },
      include: { sources: true },
    });

    await logActivity({
      userId: user.id,
      type: "generated",
      entityType: "brief",
      entityId: brief.id,
      entityName: parsed.input,
      description: `Generated brief from template "${template.name}" for "${parsed.input}"`,
    });

    return NextResponse.json({ data: createdBrief }, { status: 202 });
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
    logger.api.error("POST", "/api/templates/[id]/generate", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

/**
 * Run template generation pipeline:
 * 1. Search web for subject
 * 2. Run each template section through AI with web context
 * 3. Combine into brief results
 */
async function runTemplateGeneration(
  briefId: string,
  name: string,
  company: string | undefined,
  sections: TemplateSection[],
  userId: string,
) {
  try {
    await prisma.brief.update({
      where: { id: briefId },
      data: { status: "RESEARCHING" },
    });

    // Gather web research
    const searchQuery = `${name}${company ? ` ${company}` : ""}`;
    const webResult = await searchWeb(searchQuery, 8);

    const webContext = webResult.results
      .map((r) => `[${r.title}]: ${r.content?.slice(0, 400) || ""}`)
      .join("\n\n");

    await prisma.brief.update({
      where: { id: briefId },
      data: { status: "SYNTHESIZING" },
    });

    const BACKGROUND_CONTEXT = `You are assisting a professional who is preparing for a business conversation.
Focus on what is useful for a first meeting: who they are, what matters to them, and sensible talking points.`;

    // Process each section through AI
    const sectionResults: { key: string; label: string; content: string }[] =
      [];

    for (const section of sections) {
      const sectionPrompt = `About "${name}"${company ? ` from ${company}` : ""}:

Web research findings:
${webContext.slice(0, 4000)}

Task: ${section.prompt}

Write a focused, professional response. Be specific and factual. If data is insufficient, say so briefly rather than speculating.`;

      try {
        const result = await generate(sectionPrompt, BACKGROUND_CONTEXT);
        sectionResults.push({
          key: section.key,
          label: section.label,
          content: result.trim(),
        });
      } catch {
        sectionResults.push({
          key: section.key,
          label: section.label,
          content: `Unable to generate this section. Insufficient data available.`,
        });
      }
    }

    // Build summary from section results
    const fullContent = sectionResults
      .map((s) => `## ${s.label}\n${s.content}`)
      .join("\n\n");

    // Extract talking points and risk signals from the full content
    const extractPrompt = `Based on this research brief about "${name}":

${fullContent.slice(0, 5000)}

Extract:
1. summary: A concise 2-3 sentence executive summary
2. talkingPoints: 5 specific conversation starters (string array)
3. riskSignals: Any red/yellow flags found (string array, empty if none)
4. strategy: 1-2 sentence recommended engagement approach

Return ONLY valid JSON with keys: summary, talkingPoints, riskSignals, strategy.`;

    let synthesis = {
      summary: fullContent.slice(0, 500),
      talkingPoints: ["Review the generated sections for conversation topics"],
      riskSignals: [] as string[],
      strategy: "Gather additional information before engagement.",
    };

    try {
      const extractResult = await generate(extractPrompt, BACKGROUND_CONTEXT);
      const codeBlockMatch = extractResult.match(
        /```(?:json)?\s*([\s\S]*?)```/,
      );
      const jsonStr = codeBlockMatch
        ? codeBlockMatch[1].trim()
        : extractResult.trim();
      const parsed = JSON.parse(jsonStr);
      if (parsed && parsed.summary) {
        synthesis = {
          summary: parsed.summary || synthesis.summary,
          talkingPoints: Array.isArray(parsed.talkingPoints)
            ? parsed.talkingPoints
            : synthesis.talkingPoints,
          riskSignals: Array.isArray(parsed.riskSignals)
            ? parsed.riskSignals
            : synthesis.riskSignals,
          strategy: parsed.strategy || synthesis.strategy,
        };
      }
    } catch {
      // Use default synthesis
    }

    // Build sources from web results
    const sources: {
      type: SourceType;
      url?: string;
      title: string;
      snippet?: string;
      credibilityScore?: number;
    }[] = [];

    for (const result of webResult.results) {
      let credScore: number | undefined;
      try {
        const scoreResult = await getScoreForUrl(result.url, userId);
        credScore = scoreResult.score;
      } catch {
        credScore = 0.5;
      }

      sources.push({
        type: "WEB",
        url: result.url,
        title: result.title,
        snippet: result.content?.slice(0, 300),
        credibilityScore: credScore,
      });
    }

    // Save results
    await prisma.brief.update({
      where: { id: briefId },
      data: {
        status: "COMPLETE",
        summary: synthesis.summary,
        talkingPoints: synthesis.talkingPoints,
        riskSignals: synthesis.riskSignals,
        strategy: synthesis.strategy,
        webFindings: JSON.parse(
          JSON.stringify({
            sections: sectionResults,
            tavily: webResult,
          }),
        ),
      },
    });

    // Create source records
    for (const source of sources) {
      await prisma.source.create({
        data: {
          briefId,
          type: source.type,
          url: source.url,
          title: source.title,
          snippet: source.snippet,
          credibilityScore: source.credibilityScore,
        },
      });
    }
  } catch (error) {
    logger.warn("Template generation pipeline failed", {
      briefId,
      error: error instanceof Error ? error.message : String(error),
    });
    await prisma.brief
      .update({
        where: { id: briefId },
        data: {
          status: "FAILED",
          summary: `Generation failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      })
      .catch((e) => console.error("Failed to mark brief as failed:", e));
  }
}
