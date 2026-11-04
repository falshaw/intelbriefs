/**
 * IntelBriefs - meeting research briefs
 * Copyright (c) 2024-2026 Nick Falshaw
 */

const LABELS: Record<string, string> = {
  summary: "the summary",
  talkingPoints: "talking points",
  riskSignals: "risk signals",
  strategy: "strategy",
};

/** ["riskSignals", "talkingPoints"] -> "risk signals and talking points" */
export function describeChangedFields(fields: string[]): string {
  const words = fields.map((f) => LABELS[f] ?? f);
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
