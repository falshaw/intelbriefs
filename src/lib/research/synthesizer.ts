/**
 * IntelBriefs - Personal Intelligence Briefing
 * Copyright (c) 2024-2026 Nick Falshaw
 */

import {
  synthesizeQuick,
  synthesizeDeep,
  type BriefSynthesis,
} from "../ollama";
import { logger } from "../logger";

export type { BriefSynthesis };

export async function runQuickSynthesis(
  name: string,
  company: string | null,
  webFindings: unknown,
  crmFindings: unknown,
): Promise<BriefSynthesis> {
  try {
    logger.research.step("synthesizer", "Starting quick synthesis");
    return await synthesizeQuick(name, company, webFindings, crmFindings);
  } catch (error) {
    logger.research.error("quick-synthesis", error);
    return {
      summary: `Research collected for ${name}${company ? ` at ${company}` : ""}. AI synthesis unavailable.`,
      talkingPoints: ["Review raw findings before meeting"],
      riskSignals: [],
      strategy: "Proceed with available information.",
    };
  }
}

export async function runDeepSynthesis(
  name: string,
  company: string | null,
  webFindings: unknown,
  crmFindings: unknown,
  localFindings: unknown,
): Promise<BriefSynthesis> {
  try {
    logger.research.step("synthesizer", "Starting deep synthesis (3-pass)");
    return await synthesizeDeep(
      name,
      company,
      webFindings,
      crmFindings,
      localFindings,
    );
  } catch (error) {
    logger.research.error("deep-synthesis", error);
    return {
      summary: `Comprehensive research collected for ${name}${company ? ` at ${company}` : ""}. AI synthesis unavailable.`,
      talkingPoints: ["Review raw findings before meeting"],
      riskSignals: [],
      strategy: "Proceed with available information.",
    };
  }
}
