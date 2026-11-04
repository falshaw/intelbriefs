/**
 * IntelBriefs - Source Quality Scoring (IB-05)
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * Manage per-domain credibility scores with sensible defaults.
 */

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/session";
import { applyRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

const createSchema = z.object({
  domain: z.string().min(1).max(255),
  credibilityScore: z.number().min(0).max(1),
  category: z.enum([
    "academic",
    "government",
    "established_media",
    "industry",
    "blog",
    "forum",
    "social",
    "unknown",
  ]),
  notes: z.string().max(500).optional(),
});

// Default credibility scores by category
export const DEFAULT_CATEGORY_SCORES: Record<string, number> = {
  academic: 0.9,
  government: 0.9,
  established_media: 0.8,
  industry: 0.7,
  blog: 0.6,
  forum: 0.4,
  social: 0.3,
  unknown: 0.5,
};

// Well-known domain-to-category mappings
const KNOWN_DOMAINS: Record<string, { category: string; score: number }> = {
  // Academic
  "arxiv.org": { category: "academic", score: 0.95 },
  "scholar.google.com": { category: "academic", score: 0.9 },
  "ieee.org": { category: "academic", score: 0.95 },
  "acm.org": { category: "academic", score: 0.95 },
  "researchgate.net": { category: "academic", score: 0.85 },
  // Government
  "gov.uk": { category: "government", score: 0.9 },
  "europa.eu": { category: "government", score: 0.9 },
  "nist.gov": { category: "government", score: 0.95 },
  "enisa.europa.eu": { category: "government", score: 0.95 },
  "bsi.bund.de": { category: "government", score: 0.9 },
  "cisa.gov": { category: "government", score: 0.95 },
  // Established media
  "reuters.com": { category: "established_media", score: 0.85 },
  "bbc.com": { category: "established_media", score: 0.85 },
  "bbc.co.uk": { category: "established_media", score: 0.85 },
  "ft.com": { category: "established_media", score: 0.85 },
  "bloomberg.com": { category: "established_media", score: 0.85 },
  "techcrunch.com": { category: "established_media", score: 0.8 },
  "arstechnica.com": { category: "established_media", score: 0.8 },
  "wired.com": { category: "established_media", score: 0.8 },
  // Industry
  "gartner.com": { category: "industry", score: 0.85 },
  "forrester.com": { category: "industry", score: 0.85 },
  "darkreading.com": { category: "industry", score: 0.75 },
  "bleepingcomputer.com": { category: "industry", score: 0.75 },
  "theregister.com": { category: "industry", score: 0.75 },
  "securityweek.com": { category: "industry", score: 0.75 },
  "crunchbase.com": { category: "industry", score: 0.7 },
  // Blogs
  "medium.com": { category: "blog", score: 0.55 },
  "substack.com": { category: "blog", score: 0.55 },
  "dev.to": { category: "blog", score: 0.6 },
  "hashnode.dev": { category: "blog", score: 0.55 },
  // Forums
  "reddit.com": { category: "forum", score: 0.4 },
  "stackoverflow.com": { category: "forum", score: 0.65 },
  "news.ycombinator.com": { category: "forum", score: 0.6 },
  "quora.com": { category: "forum", score: 0.35 },
  // Social
  "twitter.com": { category: "social", score: 0.3 },
  "x.com": { category: "social", score: 0.3 },
  "linkedin.com": { category: "social", score: 0.5 },
  "facebook.com": { category: "social", score: 0.2 },
  // Wikipedia
  "wikipedia.org": { category: "academic", score: 0.7 },
  "en.wikipedia.org": { category: "academic", score: 0.7 },
};

/**
 * Get the credibility score for a URL by checking user overrides,
 * then known domains, then category defaults.
 */
export async function getScoreForUrl(
  url: string,
  userId: string,
): Promise<{ score: number; category: string; source: string }> {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");

    // Check user-specific override first
    const userScore = await prisma.sourceScore.findUnique({
      where: { userId_domain: { userId, domain: hostname } },
    });
    if (userScore) {
      return {
        score: userScore.credibilityScore,
        category: userScore.category,
        source: "user_override",
      };
    }

    // Check parent domain (e.g., "blog.example.com" -> "example.com")
    const parts = hostname.split(".");
    if (parts.length > 2) {
      const parentDomain = parts.slice(-2).join(".");
      const parentScore = await prisma.sourceScore.findUnique({
        where: { userId_domain: { userId, domain: parentDomain } },
      });
      if (parentScore) {
        return {
          score: parentScore.credibilityScore,
          category: parentScore.category,
          source: "user_override_parent",
        };
      }
    }

    // Check known domain database
    const known = KNOWN_DOMAINS[hostname];
    if (known) {
      return { score: known.score, category: known.category, source: "known" };
    }

    // Check parent in known domains
    if (parts.length > 2) {
      const parentDomain = parts.slice(-2).join(".");
      const knownParent = KNOWN_DOMAINS[parentDomain];
      if (knownParent) {
        return {
          score: knownParent.score,
          category: knownParent.category,
          source: "known_parent",
        };
      }
    }

    // Check TLD-based heuristics
    if (hostname.endsWith(".gov") || hostname.endsWith(".gov.uk")) {
      return { score: 0.9, category: "government", source: "tld_heuristic" };
    }
    if (hostname.endsWith(".edu") || hostname.endsWith(".ac.uk")) {
      return { score: 0.85, category: "academic", source: "tld_heuristic" };
    }

    return { score: 0.5, category: "unknown", source: "default" };
  } catch {
    return { score: 0.5, category: "unknown", source: "error" };
  }
}

// POST /api/sources/scores — Add or update a domain score
export async function POST(request: Request) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const domain = parsed.domain.toLowerCase().replace(/^www\./, "");

    const score = await prisma.sourceScore.upsert({
      where: { userId_domain: { userId: user.id, domain } },
      update: {
        credibilityScore: parsed.credibilityScore,
        category: parsed.category,
        notes: parsed.notes,
      },
      create: {
        userId: user.id,
        domain,
        credibilityScore: parsed.credibilityScore,
        category: parsed.category,
        notes: parsed.notes,
      },
    });

    return NextResponse.json({ data: score }, { status: 201 });
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
    logger.api.error("POST", "/api/sources/scores", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// GET /api/sources/scores — List all user's domain scores + defaults
export async function GET(request: Request) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();

    const userScores = await prisma.sourceScore.findMany({
      where: { userId: user.id },
      orderBy: { domain: "asc" },
    });

    return NextResponse.json({
      data: {
        userScores,
        knownDomains: KNOWN_DOMAINS,
        categoryDefaults: DEFAULT_CATEGORY_SCORES,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("GET", "/api/sources/scores", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
