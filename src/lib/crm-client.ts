/**
 * IntelBriefs - Personal Intelligence Briefing
 * Copyright (c) 2024-2026 Nick Falshaw
 */

import { logger } from "./logger";

const getCrmUrl = () => process.env.CRM_API_URL || "http://localhost:3011";

/**
 * Build common headers for CRM API requests.
 * Includes Bearer token from CRM_API_KEY env var for authentication.
 * NOTE: CRM_API_KEY sourced from env var (acceptable for local dev, use secrets manager in production)
 */
function getCrmHeaders(): Record<string, string> | null {
  const apiKey = process.env.CRM_API_KEY;
  if (!apiKey) {
    logger.warn("CRM_API_KEY not set — CRM integration disabled");
    return null;
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

export async function crmGet<T>(path: string): Promise<T | null> {
  const headers = getCrmHeaders();
  if (!headers) return null;

  try {
    const res = await fetch(`${getCrmUrl()}${path}`, { headers });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (error) {
    logger.debug("CRM GET failed", { path, error: String(error) });
    return null;
  }
}

export async function crmPost<T>(
  path: string,
  body: unknown,
): Promise<T | null> {
  const headers = getCrmHeaders();
  if (!headers) return null;

  try {
    const res = await fetch(`${getCrmUrl()}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (error) {
    logger.debug("CRM POST failed", { path, error: String(error) });
    return null;
  }
}

export async function checkCrmConnection(): Promise<boolean> {
  const headers = getCrmHeaders();
  if (!headers) return false;

  try {
    const res = await fetch(`${getCrmUrl()}/api/health`, {
      headers,
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
