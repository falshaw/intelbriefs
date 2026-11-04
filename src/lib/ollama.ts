/**
 * IntelBriefs - Personal Intelligence Briefing
 * Copyright (c) 2024-2026 Nick Falshaw
 */

import { logger } from "./logger";

const PROMPT_VERSION = "2026-03-01";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";

// LLM provider switch — "ollama" (default, free, local) or "claude"
// (POSTs to an optional host-side LLM gateway at CLAUDE_BRIDGE_URL, so the
// container never holds a model API key).
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 300_000;
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "ollama").toLowerCase();
const CLAUDE_BRIDGE_URL =
  process.env.CLAUDE_BRIDGE_URL || "http://host.docker.internal:7777";
const CLAUDE_MODEL = (process.env.CLAUDE_MODEL || "opus").toLowerCase();

async function generateViaClaudeBridge(
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  const res = await fetch(`${CLAUDE_BRIDGE_URL}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Name": "intelbriefs",
      ...(process.env.CLAUDE_BRIDGE_TOKEN
        ? { "X-Bridge-Token": process.env.CLAUDE_BRIDGE_TOKEN }
        : {}),
    },
    body: JSON.stringify({
      prompt,
      system: systemPrompt,
      model: CLAUDE_MODEL,
    }),
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) detail = j.error;
    } catch {
      /* keep statusText */
    }
    recordFailure();
    throw new Error(`Claude bridge error: ${detail}`);
  }
  const data = (await res.json()) as {
    ok: boolean;
    response?: string;
    error?: string;
  };
  if (!data.ok) {
    recordFailure();
    throw new Error(`Claude bridge: ${data.error ?? "unknown error"}`);
  }
  recordSuccess();
  return data.response ?? "";
}

// Circuit breaker state (module-level, shared across all calls)
let consecutiveFailures = 0;
let circuitOpenUntil: number | null = null;
const FAILURE_THRESHOLD = 5;
const CIRCUIT_OPEN_MS = 5 * 60 * 1000;

function isCircuitOpen(): boolean {
  if (circuitOpenUntil === null) return false;
  if (Date.now() < circuitOpenUntil) return true;
  circuitOpenUntil = null;
  consecutiveFailures = 0;
  return false;
}

function recordSuccess(): void {
  consecutiveFailures = 0;
}

function recordFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
  }
}

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/gi,
  /ignore\s+(all\s+)?above\s+instructions/gi,
  /disregard\s+(all\s+)?previous/gi,
  /forget\s+(all\s+)?previous/gi,
  /you\s+are\s+now/gi,
  /new\s+instructions?:/gi,
  /system\s*:/gi,
  /assistant\s*:/gi,
  /\buser\s*:/gi,
  /\bprompt\s*:/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /<<SYS>>/gi,
  /<\/SYS>/gi,
  /###\s*(system|instruction|human|assistant)/gi,
];

function sanitize(text: string, maxLength: number = 10000): string {
  let value = text;
  value = value.replace(/[\r\n]+/g, " ");
  value = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
  for (const pattern of INJECTION_PATTERNS) {
    value = value.replace(pattern, "[filtered]");
  }
  value = value.replace(/\s{2,}/g, " ").trim();
  return value.slice(0, maxLength);
}

function extractJson<T>(text: string): T | null {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}

export async function generate(
  prompt: string,
  systemPrompt?: string,
  model?: string,
): Promise<string> {
  if (isCircuitOpen()) {
    throw new Error(
      "AI service temporarily unavailable (circuit breaker open)",
    );
  }

  // Route through claude-bridge when LLM_PROVIDER=claude.
  if (LLM_PROVIDER === "claude") {
    return generateViaClaudeBridge(prompt, systemPrompt);
  }

  const maxAttempts = 3;
  const backoffMs = [500, 1000];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Self-abort a hung Ollama socket — the breaker + retry don't cover a
        // stalled connection that never returns. A timeout counts as a failure.
        signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
        body: JSON.stringify({
          model: model || OLLAMA_MODEL,
          prompt: sanitize(prompt),
          system: systemPrompt ? sanitize(systemPrompt) : undefined,
          stream: false,
          options: { temperature: 0.3, num_predict: 4096 },
        }),
      });

      // Do not retry on 4xx errors (bad model name, etc.)
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
      }

      if (!res.ok) {
        // 5xx — treat as connection error, retry
        recordFailure();
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, backoffMs[attempt]));
          continue;
        }
        throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      recordSuccess();
      return data.response || "";
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      const isConnectionError =
        message.includes("ECONNREFUSED") ||
        message.includes("fetch failed") ||
        message.includes("network error") ||
        message.toLowerCase().includes("abort") || // AbortSignal.timeout fired
        message.toLowerCase().includes("timeout");

      if (!isConnectionError) {
        throw error;
      }

      recordFailure();
      // A timed-out generation would only repeat the same long wait.
      const timedOut = /abort|timeout/i.test(message);
      if (!timedOut && attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, backoffMs[attempt]));
        continue;
      }
      throw error;
    }
  }

  // Unreachable but satisfies TypeScript
  throw new Error("Ollama error: failed after retries");
}

export async function checkConnection(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export interface BriefSynthesis {
  summary: string;
  talkingPoints: string[];
  riskSignals: string[];
  strategy: string;
}

const BACKGROUND_CONTEXT = `You are assisting a professional who is preparing for a business conversation.
Focus on what is useful for a first meeting: who they are, what matters to them, and sensible talking points.`;

export async function synthesizeQuick(
  name: string,
  company: string | null,
  webFindings: unknown,
  crmFindings: unknown,
): Promise<BriefSynthesis> {
  const prompt = `Analyze the following research findings about "${sanitize(name)}"${company ? ` from ${sanitize(company)}` : ""}.

Web findings:
${JSON.stringify(webFindings || {}).slice(0, 3000)}

CRM history:
${JSON.stringify(crmFindings || {}).slice(0, 2000)}

Example output:
{"summary": "Jane Doe is VP Operations at Contoso, a logistics company with 1,200 employees. She has run its warehouse network for four years.", "talkingPoints": ["Contoso opened a second distribution centre this year: ask what they learned from the move", "She spoke at a logistics conference on warehouse robots: use her talk as an opener", "Contoso aims for next-day delivery in all core markets: ask what stands in the way"], "riskSignals": ["Two trade-press reports of late deliveries last quarter"], "strategy": "Start with her own talk, then link your topic to the next-day delivery goal."}

Return JSON with:
- summary: 2-3 sentence overview of who this person/company is
- talkingPoints: array of 3-5 conversation starters that fit the purpose of the meeting
- riskSignals: array of 0-3 yellow/red flags (empty array if none)
- strategy: 1-2 sentence recommended approach for the relationship

Return ONLY valid JSON, no markdown.`;

  const result = await generate(prompt, BACKGROUND_CONTEXT);
  const parsed = extractJson<BriefSynthesis>(result);

  if (parsed && parsed.summary && Array.isArray(parsed.talkingPoints)) {
    return parsed;
  }

  return {
    summary: result.slice(0, 500),
    talkingPoints: ["Review web findings for conversation topics"],
    riskSignals: [],
    strategy: "Gather more information before engagement.",
  };
}

export async function synthesizeDeep(
  name: string,
  company: string | null,
  webFindings: unknown,
  crmFindings: unknown,
  localFindings: unknown,
): Promise<BriefSynthesis> {
  // Pass 1: Summarize findings
  const summaryPrompt = `Summarize all research findings about "${sanitize(name)}"${company ? ` from ${sanitize(company)}` : ""}.

Web findings:
${JSON.stringify(webFindings || {}).slice(0, 4000)}

CRM history:
${JSON.stringify(crmFindings || {}).slice(0, 3000)}

Local file mentions:
${JSON.stringify(localFindings || {}).slice(0, 2000)}

Write a 3-5 sentence professional summary. Focus on role, expertise, company, and notable achievements. Be factual.`;

  const summary = await generate(summaryPrompt, BACKGROUND_CONTEXT);

  // Pass 2: Talking points for the meeting
  const talkingPointsPrompt = `Based on this person summary:
${summary.slice(0, 2000)}

Generate 5-7 specific talking points for a meeting. Each should:
1. Reference something specific about them
2. Connect to the likely purpose of the meeting and the reader's own goals
3. Be actionable conversation starters, not generic

Return a JSON array of strings. Return ONLY the JSON array.`;

  const tpResult = await generate(talkingPointsPrompt, BACKGROUND_CONTEXT);
  const talkingPoints = extractJson<string[]>(tpResult) || [
    "Review findings for conversation topics",
  ];

  // Pass 3: Risk assessment + strategy
  const strategyPrompt = `Based on this person summary:
${summary.slice(0, 2000)}

Analyze for:
1. riskSignals: Any red/yellow flags (e.g. company financial trouble, litigation history, high turnover, misaligned values). Return empty array if none found.
2. strategy: Recommended relationship approach in 2-3 sentences. Consider: how to build trust, what value to offer, potential partnership models.

Return JSON with keys: riskSignals (string array), strategy (string). Return ONLY valid JSON.`;

  const stratResult = await generate(strategyPrompt, BACKGROUND_CONTEXT);
  const stratParsed = extractJson<{ riskSignals: string[]; strategy: string }>(
    stratResult,
  );

  return {
    summary: summary.trim(),
    talkingPoints: Array.isArray(talkingPoints)
      ? talkingPoints
      : [String(talkingPoints)],
    riskSignals: stratParsed?.riskSignals || [],
    strategy:
      stratParsed?.strategy ||
      "Build rapport through shared professional interests.",
  };
}

export async function getStatus(): Promise<{
  connected: boolean;
  host: string;
  model: string;
  error?: string;
}> {
  try {
    const connected = await checkConnection();
    return {
      connected,
      host: OLLAMA_HOST,
      model: OLLAMA_MODEL,
      ...(!connected && { error: "Ollama service not responding" }),
    };
  } catch (e) {
    return {
      connected: false,
      host: OLLAMA_HOST,
      model: OLLAMA_MODEL,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}
