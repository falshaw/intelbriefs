/**
 * IntelBriefs - Personal Intelligence Briefing
 * Copyright (c) 2024-2026 Nick Falshaw
 */

import { prisma } from "../prisma";
import { logger } from "../logger";
import {
  searchWeb,
  searchWebDeep,
  searchExa,
  lookupCrm,
  lookupCrmFull,
  scanLocalFiles,
} from "./collector";
import { runQuickSynthesis, runDeepSynthesis } from "./synthesizer";
import {
  updateBriefStatus,
  saveBriefResults,
  markBriefFailed,
  pushToCrm,
} from "./writer";
import { getScoreForUrl } from "@/app/api/sources/scores/route";
import type { SourceType } from "@prisma/client";

/**
 * Assign credibility score to a source based on its URL and user preferences.
 * Non-URL sources (CRM, local files) get fixed scores.
 */
async function scoreSource(
  type: SourceType,
  url: string | undefined,
  userId: string,
): Promise<number | undefined> {
  if (type === "CRM") return 0.85; // Internal CRM data is trusted
  if (type === "LOCAL_FILE") return 0.8; // Local files are user's own data
  if (type === "LINKEDIN") return 0.6; // LinkedIn profiles are self-reported
  if (url) {
    try {
      const result = await getScoreForUrl(url, userId);
      return result.score;
    } catch {
      return 0.5;
    }
  }
  return undefined;
}

interface PipelineInput {
  name: string;
  company?: string | null;
  linkedinUrl?: string | null;
  context?: string | null;
}

function parseInput(input: string): PipelineInput {
  const parts = input.trim().split(/\s+/);

  if (parts.length >= 3) {
    const name = parts.slice(0, 2).join(" ");
    const company = parts.slice(2).join(" ");
    return { name, company };
  }

  if (parts.length === 2) {
    return { name: input.trim() };
  }

  return { name: input.trim() };
}

// =============================================================================
// Quick Pipeline (~5 min on a local model)
// =============================================================================

export async function runQuickPipeline(briefId: string) {
  const brief = await prisma.brief.findUnique({ where: { id: briefId } });
  if (!brief) throw new Error(`Brief ${briefId} not found`);

  logger.research.start(briefId, "QUICK");

  try {
    await updateBriefStatus(briefId, "RESEARCHING");

    const [webResult, crmResult] = await Promise.all([
      searchWeb(`${brief.name}${brief.company ? ` ${brief.company}` : ""}`, 5),
      lookupCrm(brief.name),
    ]);

    logger.research.step(briefId, "Data collected, synthesizing");
    await updateBriefStatus(briefId, "SYNTHESIZING");

    const synthesis = await runQuickSynthesis(
      brief.name,
      brief.company,
      webResult,
      crmResult,
    );

    const sources: {
      type: SourceType;
      url?: string;
      title: string;
      snippet?: string;
      raw?: unknown;
      credibilityScore?: number;
    }[] = [];

    for (const result of webResult.results) {
      const credScore = await scoreSource("WEB", result.url, brief.userId);
      sources.push({
        type: "WEB",
        url: result.url,
        title: result.title,
        snippet: result.content?.slice(0, 300),
        credibilityScore: credScore,
      });
    }

    if (crmResult.contact) {
      sources.push({
        type: "CRM",
        title: `CRM: ${crmResult.contact.firstName} ${crmResult.contact.lastName}`,
        snippet: crmResult.contact.notes?.slice(0, 300),
        raw: crmResult,
        credibilityScore: 0.85,
      });
    }

    const completedBrief = await saveBriefResults(
      briefId,
      synthesis,
      webResult,
      crmResult,
      null,
      sources,
    );

    pushToCrm(briefId).catch((err) =>
      logger.warn("CRM push failed (non-blocking)", { error: String(err) }),
    );

    return completedBrief;
  } catch (error) {
    logger.research.error(briefId, error);
    await markBriefFailed(
      briefId,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

// =============================================================================
// Deep Pipeline (~10 min on a local model)
// =============================================================================

export async function runDeepPipeline(briefId: string) {
  const brief = await prisma.brief.findUnique({ where: { id: briefId } });
  if (!brief) throw new Error(`Brief ${briefId} not found`);

  logger.research.start(briefId, "DEEP");

  try {
    await updateBriefStatus(briefId, "RESEARCHING");

    const [webResult, exaResults, crmResult, localMatches] = await Promise.all([
      searchWebDeep(brief.name, brief.company),
      searchExa(
        `${brief.name}${brief.company ? ` ${brief.company}` : ""} professional`,
        5,
      ),
      lookupCrmFull(brief.name),
      scanLocalFiles(brief.name),
    ]);

    let linkedinData: unknown = null;
    if (brief.linkedinUrl) {
      try {
        const liResults = await searchExa(`site:linkedin.com ${brief.name}`, 3);
        linkedinData = liResults;
      } catch {
        // Best-effort
      }
    }

    logger.research.step(
      briefId,
      "All data collected, starting multi-pass synthesis",
    );
    await updateBriefStatus(briefId, "SYNTHESIZING");

    const mergedWebFindings = {
      tavily: webResult,
      exa: exaResults,
      linkedin: linkedinData,
    };

    const synthesis = await runDeepSynthesis(
      brief.name,
      brief.company,
      mergedWebFindings,
      crmResult,
      localMatches,
    );

    const sources: {
      type: SourceType;
      url?: string;
      title: string;
      snippet?: string;
      raw?: unknown;
      credibilityScore?: number;
    }[] = [];

    for (const result of webResult.results) {
      const credScore = await scoreSource("WEB", result.url, brief.userId);
      sources.push({
        type: "WEB",
        url: result.url,
        title: result.title,
        snippet: result.content?.slice(0, 300),
        credibilityScore: credScore,
      });
    }

    for (const result of exaResults) {
      const credScore = await scoreSource("WEB", result.url, brief.userId);
      sources.push({
        type: "WEB",
        url: result.url,
        title: `[Exa] ${result.title}`,
        snippet: result.text?.slice(0, 300),
        credibilityScore: credScore,
      });
    }

    if (linkedinData && Array.isArray(linkedinData)) {
      for (const li of linkedinData as {
        url: string;
        title: string;
        text?: string;
      }[]) {
        sources.push({
          type: "LINKEDIN",
          url: li.url,
          title: li.title,
          snippet: li.text?.slice(0, 300),
          credibilityScore: 0.6,
        });
      }
    }

    if (crmResult.contact) {
      sources.push({
        type: "CRM",
        title: `CRM: ${crmResult.contact.firstName} ${crmResult.contact.lastName}`,
        snippet: crmResult.contact.notes?.slice(0, 300),
        raw: { contact: crmResult.contact, activities: crmResult.activities },
        credibilityScore: 0.85,
      });
    }

    for (const match of localMatches.slice(0, 10)) {
      sources.push({
        type: "LOCAL_FILE",
        title: match.file,
        snippet: match.line,
        credibilityScore: 0.8,
      });
    }

    const completedBrief = await saveBriefResults(
      briefId,
      synthesis,
      mergedWebFindings,
      crmResult,
      localMatches,
      sources,
    );

    pushToCrm(briefId).catch((err) =>
      logger.warn("CRM push failed (non-blocking)", { error: String(err) }),
    );

    return completedBrief;
  } catch (error) {
    logger.research.error(briefId, error);
    await markBriefFailed(
      briefId,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

// =============================================================================
// Entry Point
// =============================================================================

const PIPELINE_TIMEOUT_MS = { QUICK: 600_000, DEEP: 1_200_000 } as const;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  briefId: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Pipeline timed out after ${ms / 1000}s`)),
        ms,
      ),
    ),
  ]).catch(async (err) => {
    await markBriefFailed(
      briefId,
      err instanceof Error ? err.message : String(err),
    ).catch((e) => console.error("Failed to mark brief as failed:", e));
    throw err;
  });
}

export async function createAndRunBrief(
  input: string,
  mode: "QUICK" | "DEEP",
  userId: string,
): Promise<string> {
  const parsed = parseInput(input);

  const type =
    parsed.company && !parsed.name.includes(" ")
      ? ("COMPANY" as const)
      : ("PERSON" as const);

  const brief = await prisma.brief.create({
    data: {
      type,
      mode,
      status: "PENDING",
      name: parsed.name,
      company: parsed.company,
      linkedinUrl: parsed.linkedinUrl,
      context: parsed.context,
      userId,
    },
  });

  // Run pipeline asynchronously with timeout
  const pipelineFn = mode === "QUICK" ? runQuickPipeline : runDeepPipeline;
  const timeoutMs = PIPELINE_TIMEOUT_MS[mode];
  withTimeout(pipelineFn(brief.id), timeoutMs, brief.id).catch((err) =>
    logger.research.error(brief.id, err),
  );

  return brief.id;
}

export { parseInput };
