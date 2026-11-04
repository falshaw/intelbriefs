/**
 * IntelBriefs - Personal Intelligence Briefing
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * POST /api/briefs/enrich — CRM Auto-Enrichment Endpoint (IB-03)
 *
 * Accepts CRM contact data and triggers auto-enrichment.
 * Returns 202 Accepted immediately — client polls GET /api/briefs/[id] for completion.
 */

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { logAudit, getClientIp } from "@/lib/audit";
import { applyRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { createAndRunBrief } from "@/lib/research/pipeline";

const enrichSchema = z.object({
  contactId: z.string().min(1).max(200),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  company: z.string().max(200).optional(),
  linkedinUrl: z.string().url().optional(),
  mode: z.enum(["QUICK", "DEEP"]).optional(),
});

/** Duplicate window — briefs for the same contact within 7 days are reused */
const DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const rateLimited = await applyRateLimit(
    request,
    RATE_LIMITS.research,
    "enrich",
  );
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = enrichSchema.parse(body);

    const fullName = `${parsed.firstName} ${parsed.lastName}`;

    logger.api.request("POST", "/api/briefs/enrich", {
      contactId: parsed.contactId,
      name: fullName,
    });

    // Check for existing recent brief for this contact (avoid duplicates)
    const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const existingBrief = await prisma.brief.findFirst({
      where: {
        sourceContactId: parsed.contactId,
        userId: user.id,
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingBrief) {
      logger.info("Enrichment skipped — recent brief exists", {
        briefId: existingBrief.id,
        contactId: parsed.contactId,
      });
      return NextResponse.json(
        {
          briefId: existingBrief.id,
          status: existingBrief.status,
          message: `Recent brief already exists for ${fullName}`,
          existing: true,
        },
        { status: 200 },
      );
    }

    // Determine enrichment mode: request override > AppSettings > fallback QUICK
    let mode = parsed.mode;
    if (!mode) {
      const settings = await prisma.appSettings.findUnique({
        where: { userId: user.id },
        select: { autoEnrichMode: true },
      });
      mode = (settings?.autoEnrichMode as "QUICK" | "DEEP") || "QUICK";
    }

    // Build the input string for the pipeline
    const input = parsed.company ? `${fullName} ${parsed.company}` : fullName;

    const briefId = await createAndRunBrief(input, mode, user.id);

    // Update the created brief with sourceContactId
    await prisma.brief.update({
      where: { id: briefId },
      data: { sourceContactId: parsed.contactId },
    });

    await logActivity({
      userId: user.id,
      type: "enriched",
      entityType: "brief",
      entityId: briefId,
      entityName: fullName,
      description: `Auto-enriched ${mode} brief for CRM contact "${fullName}"`,
    });

    await logAudit({
      userId: user.id,
      action: "brief.enrich",
      resource: "brief",
      resourceId: briefId,
      metadata: {
        contactId: parsed.contactId,
        name: fullName,
        company: parsed.company,
        mode,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(
      {
        briefId,
        status: "PENDING",
        message: `Enrichment started for ${fullName}`,
      },
      { status: 202 },
    );
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
    logger.api.error("POST", "/api/briefs/enrich", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
