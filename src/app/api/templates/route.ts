/**
 * IntelBriefs - Brief Templates (IB-04)
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * CRUD for brief templates — pre-meeting, investor, competitor, hiring manager, custom.
 */

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/session";
import { applyRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

const sectionSchema = z.object({
  key: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  prompt: z.string().min(1).max(1000),
  order: z.number().int().min(0),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum([
    "PRE_MEETING",
    "INVESTOR",
    "COMPETITOR",
    "HIRING_MANAGER",
    "CUSTOM",
  ]),
  description: z.string().max(500).optional(),
  sections: z.array(sectionSchema).min(1).max(20),
  isDefault: z.boolean().default(false),
});

// Default template definitions for seeding
const DEFAULT_TEMPLATES = {
  PRE_MEETING: {
    name: "Pre-Meeting Brief",
    description:
      "Standard preparation brief for business meetings. Covers background, company info, talking points, and risk signals.",
    sections: [
      {
        key: "background",
        label: "Background",
        prompt:
          "Summarize the person/company background, role, and career history. Focus on their current position and responsibilities.",
        order: 0,
      },
      {
        key: "company",
        label: "Company Overview",
        prompt:
          "Describe their company: size, industry, recent news, financial status, and competitive position.",
        order: 1,
      },
      {
        key: "talking_points",
        label: "Talking Points",
        prompt:
          "Generate 5-7 specific conversation starters based on their background and the purpose of the meeting.",
        order: 2,
      },
      {
        key: "risk_signals",
        label: "Risk Signals",
        prompt:
          "Identify any red or yellow flags: financial trouble, litigation, high turnover, misaligned values, or negative press.",
        order: 3,
      },
      {
        key: "strategy",
        label: "Engagement Strategy",
        prompt:
          "Recommend approach for the meeting: how to build trust, what value to offer, and potential collaboration models.",
        order: 4,
      },
    ],
  },
  INVESTOR: {
    name: "Investor Research",
    description:
      "Due diligence template for potential investors or funding sources. Covers portfolio, investment thesis, and deal terms.",
    sections: [
      {
        key: "investor_profile",
        label: "Investor Profile",
        prompt:
          "Summarize the investor: fund size, investment stage preference, sector focus, and geographic coverage.",
        order: 0,
      },
      {
        key: "portfolio",
        label: "Portfolio Analysis",
        prompt:
          "List notable portfolio companies, especially in cybersecurity, SaaS, or enterprise software. Note any competitors.",
        order: 1,
      },
      {
        key: "thesis",
        label: "Investment Thesis",
        prompt:
          "What is their stated investment thesis? What patterns emerge from their portfolio choices?",
        order: 2,
      },
      {
        key: "terms",
        label: "Typical Deal Terms",
        prompt:
          "What are typical check sizes, valuation expectations, board seat requirements, and follow-on patterns?",
        order: 3,
      },
      {
        key: "pitch_strategy",
        label: "Pitch Strategy",
        prompt:
          "How should we position our company to align with their thesis? What metrics and milestones would resonate?",
        order: 4,
      },
    ],
  },
  COMPETITOR: {
    name: "Competitor Analysis",
    description:
      "Competitive intelligence template for analyzing rival companies. Covers product, market position, and strategic moves.",
    sections: [
      {
        key: "company_overview",
        label: "Company Overview",
        prompt:
          "Describe the competitor: founding year, team size, funding, headquarters, and mission statement.",
        order: 0,
      },
      {
        key: "product_analysis",
        label: "Product Analysis",
        prompt:
          "Detail their product offering: features, pricing model, target market, and technical architecture if known.",
        order: 1,
      },
      {
        key: "market_position",
        label: "Market Position",
        prompt:
          "Where do they sit in the market? Customer base, market share estimates, key accounts, and partner ecosystem.",
        order: 2,
      },
      {
        key: "swot",
        label: "SWOT Analysis",
        prompt:
          "Identify strengths, weaknesses, opportunities, and threats relative to our offering.",
        order: 3,
      },
      {
        key: "strategic_moves",
        label: "Recent Strategic Moves",
        prompt:
          "What recent announcements, product launches, partnerships, or hiring patterns signal their strategic direction?",
        order: 4,
      },
    ],
  },
  HIRING_MANAGER: {
    name: "Hiring Manager Brief",
    description:
      "Interview preparation template for meeting hiring managers. Covers their background, team, and what they look for.",
    sections: [
      {
        key: "manager_background",
        label: "Manager Background",
        prompt:
          "Summarize the hiring manager: career trajectory, current role duration, previous companies, and technical expertise.",
        order: 0,
      },
      {
        key: "team_context",
        label: "Team Context",
        prompt:
          "What team do they lead? Team size, recent hires, tech stack, and current projects or initiatives.",
        order: 1,
      },
      {
        key: "company_culture",
        label: "Company Culture",
        prompt:
          "Describe the company culture: Glassdoor ratings, work style (remote/hybrid), values, and employee sentiment.",
        order: 2,
      },
      {
        key: "interview_prep",
        label: "Interview Preparation",
        prompt:
          "What questions are they likely to ask? What technical topics should be prepared? What are their known priorities?",
        order: 3,
      },
      {
        key: "talking_points",
        label: "Talking Points",
        prompt:
          "Generate 5 conversation points that demonstrate alignment with their team needs and technical interests.",
        order: 4,
      },
    ],
  },
};

// POST /api/templates — Create a brief template
export async function POST(request: Request) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = createSchema.parse(body);

    // If marking as default, unset existing default of same type
    if (parsed.isDefault) {
      await prisma.briefTemplate.updateMany({
        where: { userId: user.id, type: parsed.type, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.briefTemplate.create({
      data: {
        userId: user.id,
        name: parsed.name,
        type: parsed.type,
        description: parsed.description,
        sections: JSON.parse(JSON.stringify(parsed.sections)),
        isDefault: parsed.isDefault,
      },
    });

    return NextResponse.json({ data: template }, { status: 201 });
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
    logger.api.error("POST", "/api/templates", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// GET /api/templates — List templates (with optional seeding of defaults)
export async function GET(request: Request) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const seedDefaults = searchParams.get("seed") === "true";

    // Seed default templates if none exist and requested
    if (seedDefaults) {
      const existingCount = await prisma.briefTemplate.count({
        where: { userId: user.id },
      });

      if (existingCount === 0) {
        for (const [templateType, templateDef] of Object.entries(
          DEFAULT_TEMPLATES,
        )) {
          await prisma.briefTemplate.create({
            data: {
              userId: user.id,
              name: templateDef.name,
              type: templateType as
                | "PRE_MEETING"
                | "INVESTOR"
                | "COMPETITOR"
                | "HIRING_MANAGER",
              description: templateDef.description,
              sections: JSON.parse(JSON.stringify(templateDef.sections)),
              isDefault: true,
            },
          });
        }
      }
    }

    const where: Record<string, unknown> = { userId: user.id };
    if (type) where.type = type;

    const templates = await prisma.briefTemplate.findMany({
      where,
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ data: templates });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("GET", "/api/templates", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
