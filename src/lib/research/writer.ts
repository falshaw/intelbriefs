/**
 * IntelBriefs - Personal Intelligence Briefing
 * Copyright (c) 2024-2026 Nick Falshaw
 */

import { prisma } from "../prisma";
import { logger } from "../logger";
import type { BriefSynthesis } from "./synthesizer";
import type { BriefStatus, SourceType } from "@prisma/client";

interface SourceInput {
  type: SourceType;
  url?: string;
  title: string;
  snippet?: string;
  raw?: unknown;
  credibilityScore?: number;
}

export async function updateBriefStatus(briefId: string, status: BriefStatus) {
  return prisma.brief.update({
    where: { id: briefId },
    data: { status },
  });
}

export async function saveBriefResults(
  briefId: string,
  synthesis: BriefSynthesis,
  webFindings: unknown,
  crmFindings: unknown,
  localFindings: unknown,
  sources: SourceInput[],
) {
  const brief = await prisma.brief.update({
    where: { id: briefId },
    data: {
      status: "COMPLETE",
      summary: synthesis.summary,
      talkingPoints: synthesis.talkingPoints,
      riskSignals: synthesis.riskSignals,
      strategy: synthesis.strategy,
      webFindings: (webFindings as object) || undefined,
      crmFindings: (crmFindings as object) || undefined,
      localFindings: (localFindings as object) || undefined,
    },
  });

  if (sources.length > 0) {
    await prisma.source.createMany({
      data: sources.map((s) => ({
        briefId,
        type: s.type,
        url: s.url,
        title: s.title,
        snippet: s.snippet,
        raw: (s.raw as object) || undefined,
        credibilityScore: s.credibilityScore ?? null,
      })),
    });
  }

  logger.research.complete(briefId, { sourceCount: sources.length });
  return brief;
}

export async function markBriefFailed(briefId: string, error: string) {
  return prisma.brief.update({
    where: { id: briefId },
    data: {
      status: "FAILED",
      summary: `Research failed: ${error}`,
    },
  });
}

// =============================================================================
// CRM Push
// =============================================================================

export async function pushToCrm(
  briefId: string,
): Promise<{ success: boolean; contactId?: string }> {
  const crmUrl = process.env.CRM_API_URL;
  if (!crmUrl) {
    logger.warn("CRM URL not configured, skipping CRM push");
    return { success: false };
  }

  const brief = await prisma.brief.findUnique({ where: { id: briefId } });
  if (!brief) {
    return { success: false };
  }

  try {
    const searchRes = await fetch(
      `${crmUrl}/api/contacts?search=${encodeURIComponent(brief.name)}&limit=1`,
      { headers: { "Content-Type": "application/json" } },
    );

    let contactId: string | undefined;

    if (searchRes.ok) {
      const data = await searchRes.json();
      const existing = Array.isArray(data.data || data)
        ? (data.data || data)[0]
        : null;
      if (existing) {
        contactId = existing.id;
      }
    }

    if (!contactId) {
      const nameParts = brief.name.split(" ");
      const firstName = nameParts[0] || brief.name;
      const lastName = nameParts.slice(1).join(" ") || "";

      const createRes = await fetch(`${crmUrl}/api/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          type: brief.type === "COMPANY" ? "lead" : "person",
          tags: ["intel-brief"],
          notes:
            brief.summary || `IntelBrief created ${new Date().toISOString()}`,
        }),
      });

      if (createRes.ok) {
        const created = await createRes.json();
        contactId = created.id;
      }
    }

    if (!contactId) {
      return { success: false };
    }

    await fetch(`${crmUrl}/api/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "intel_brief",
        description: [
          `**IntelBrief (${brief.mode}):** ${brief.summary || "No summary"}`,
          brief.talkingPoints.length > 0
            ? `\n**Talking Points:**\n${brief.talkingPoints.map((tp) => `- ${tp}`).join("\n")}`
            : "",
          brief.riskSignals.length > 0
            ? `\n**Risk Signals:**\n${brief.riskSignals.map((rs) => `- ${rs}`).join("\n")}`
            : "",
          brief.strategy ? `\n**Strategy:** ${brief.strategy}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        entityType: "contact",
        entityId: contactId,
        entityName: brief.name,
      }),
    });

    await prisma.brief.update({
      where: { id: briefId },
      data: { crmContactId: contactId, crmSynced: true },
    });

    logger.info("Brief pushed to CRM", { briefId, contactId });
    return { success: true, contactId };
  } catch (error) {
    logger.research.error("crm-push", error);
    return { success: false };
  }
}
