/**
 * IntelBriefs - Personal Intelligence Briefing
 * Copyright (c) 2024-2026 Nick Falshaw
 */

import { logger } from "../logger";

// =============================================================================
// CRM Auth Headers (shared by all CRM calls in this module)
// =============================================================================

/**
 * Build headers for CRM API requests.
 * Mirrors the auth logic in crm-client.ts to include Bearer token.
 * NOTE: CRM_API_KEY sourced from env var (acceptable for local dev, use secrets manager in production)
 */
function getCrmHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const apiKey = process.env.CRM_API_KEY;
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  return headers;
}

// =============================================================================
// Web Search (Tavily)
// =============================================================================

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
  answer?: string;
}

export async function searchWeb(
  query: string,
  maxResults: number = 5,
): Promise<{ results: TavilyResult[]; answer?: string }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    logger.warn("Tavily API key not configured, skipping web search");
    return { results: [] };
  }

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: query.slice(0, 400),
        max_results: maxResults,
        include_answer: true,
        search_depth: "basic",
      }),
    });

    if (!res.ok) {
      logger.warn("Tavily search failed", { status: res.status });
      return { results: [] };
    }

    const data = (await res.json()) as TavilyResponse;
    return { results: data.results || [], answer: data.answer };
  } catch (error) {
    logger.research.error("web-search", error);
    return { results: [] };
  }
}

export async function searchWebDeep(
  name: string,
  company: string | null,
): Promise<{ results: TavilyResult[]; answer?: string }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return { results: [] };
  }

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: `${name}${company ? ` ${company}` : ""} professional background LinkedIn`,
        max_results: 10,
        include_answer: true,
        search_depth: "advanced",
      }),
    });

    if (!res.ok) {
      return { results: [] };
    }

    const data = (await res.json()) as TavilyResponse;
    return { results: data.results || [], answer: data.answer };
  } catch (error) {
    logger.research.error("web-search-deep", error);
    return { results: [] };
  }
}

// =============================================================================
// Exa Search (for deep mode)
// =============================================================================

interface ExaResult {
  title: string;
  url: string;
  text?: string;
  publishedDate?: string;
}

export async function searchExa(
  query: string,
  maxResults: number = 5,
): Promise<ExaResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    logger.warn("Exa API key not configured, skipping Exa search");
    return [];
  }

  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query: query.slice(0, 400),
        numResults: maxResults,
        type: "neural",
        useAutoprompt: true,
        contents: { text: { maxCharacters: 1000 } },
      }),
    });

    if (!res.ok) {
      logger.warn("Exa search failed", { status: res.status });
      return [];
    }

    const data = await res.json();
    return (data.results || []) as ExaResult[];
  } catch (error) {
    logger.research.error("exa-search", error);
    return [];
  }
}

// =============================================================================
// CRM Lookup
// =============================================================================

interface CrmContact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  company?: { name: string };
  notes?: string;
  tags?: string[];
}

interface CrmActivity {
  id: string;
  type: string;
  description: string;
  createdAt: string;
}

export async function lookupCrm(
  name: string,
  maxActivities: number = 5,
): Promise<{ contact: CrmContact | null; activities: CrmActivity[] }> {
  const crmUrl = process.env.CRM_API_URL;
  if (!crmUrl) {
    logger.debug("CRM URL not configured, skipping CRM lookup");
    return { contact: null, activities: [] };
  }

  try {
    const searchRes = await fetch(
      `${crmUrl}/api/contacts?search=${encodeURIComponent(name)}&limit=1`,
      { headers: getCrmHeaders() },
    );

    if (!searchRes.ok) {
      logger.warn("CRM contact search failed", { status: searchRes.status });
      return { contact: null, activities: [] };
    }

    const searchData = await searchRes.json();
    const contacts = searchData.data || searchData || [];
    const contact = Array.isArray(contacts) ? contacts[0] || null : null;

    if (!contact) {
      return { contact: null, activities: [] };
    }

    const actRes = await fetch(
      `${crmUrl}/api/activities?entityType=contact&entityId=${contact.id}&limit=${maxActivities}`,
      { headers: getCrmHeaders() },
    );

    const activities = actRes.ok ? (await actRes.json()).data || [] : [];

    return { contact, activities };
  } catch (error) {
    logger.research.error("crm-lookup", error);
    return { contact: null, activities: [] };
  }
}

export async function lookupCrmFull(name: string): Promise<{
  contact: CrmContact | null;
  activities: CrmActivity[];
  deals: unknown[];
}> {
  const base = await lookupCrm(name, 20);

  if (!base.contact) {
    return { ...base, deals: [] };
  }

  const crmUrl = process.env.CRM_API_URL;
  if (!crmUrl) {
    return { ...base, deals: [] };
  }

  try {
    const dealsRes = await fetch(
      `${crmUrl}/api/deals?search=${encodeURIComponent(name)}&limit=10`,
      { headers: getCrmHeaders() },
    );
    const deals = dealsRes.ok ? (await dealsRes.json()).data || [] : [];
    return { ...base, deals };
  } catch {
    return { ...base, deals: [] };
  }
}

// =============================================================================
// Local File Scanner (uses execFile for safety — no shell injection)
// =============================================================================

export interface LocalFileMatch {
  file: string;
  line: string;
  lineNumber: number;
}

export async function scanLocalFiles(
  name: string,
  paths: string[] = ["docs/", "notes/"],
): Promise<LocalFileMatch[]> {
  const matches: LocalFileMatch[] = [];

  // Sanitize search term: only allow alphanumeric, spaces, hyphens, dots
  const searchTerm = name.replace(/[^a-zA-Z0-9\s\-\.]/g, "").trim();
  if (!searchTerm || searchTerm.length < 2) return [];

  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const searchLower = searchTerm.toLowerCase();
    const allowedExts = new Set([".md", ".txt", ".json"]);

    async function walkDir(dir: string): Promise<void> {
      if (matches.length >= 20) return;
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (matches.length >= 20) return;
          const fullPath = path.join(dir, entry.name);
          if (
            entry.isDirectory() &&
            !entry.name.startsWith(".") &&
            entry.name !== "node_modules"
          ) {
            await walkDir(fullPath);
          } else if (
            entry.isFile() &&
            allowedExts.has(path.extname(entry.name).toLowerCase())
          ) {
            try {
              const content = await fs.readFile(fullPath, "utf-8");
              const lines = content.split("\n");
              for (let i = 0; i < lines.length && matches.length < 20; i++) {
                if (lines[i].toLowerCase().includes(searchLower)) {
                  matches.push({
                    file: fullPath,
                    lineNumber: i + 1,
                    line: lines[i].trim().slice(0, 200),
                  });
                }
              }
            } catch {
              // File read error — skip
            }
          }
        }
      } catch {
        // Directory read error — skip
      }
    }

    for (const scanPath of paths) {
      await walkDir(scanPath);
    }
  } catch (error) {
    logger.debug("Local file scan unavailable", { error: String(error) });
  }

  return matches;
}
