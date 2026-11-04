/**
 * IntelBriefs - Personal Intelligence Briefing
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * POST /api/webhooks/crm — CRM Webhook Receiver (IB-03)
 *
 * Webhook endpoint called by CRM when contacts are created or updated.
 * Authenticates via X-Webhook-Secret header.
 * When auto-enrich is enabled, triggers enrichment for new contacts.
 */

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit, getClientIp } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { createAndRunBrief } from "@/lib/research/pipeline";

const webhookBodySchema = z.object({
  event: z.enum(["contact.created", "contact.updated"]),
  contact: z.object({
    id: z.string().min(1),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().optional(),
    phone: z.string().optional(),
    company: z.object({ name: z.string() }).nullable().optional(),
    tags: z.array(z.string()).optional(),
  }),
  timestamp: z.string(),
});

/** Duplicate window — briefs for the same contact within 7 days are reused */
const DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    // 1. Validate webhook secret
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.warn("WEBHOOK_SECRET not configured — rejecting webhook");
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 403 },
      );
    }

    const providedSecret = request.headers.get("X-Webhook-Secret");
    if (providedSecret !== webhookSecret) {
      logger.warn("Webhook auth failed — invalid secret");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Parse and validate body
    const body = await request.json();
    const parsed = webhookBodySchema.parse(body);

    logger.api.request("POST", "/api/webhooks/crm", {
      event: parsed.event,
      contactId: parsed.contact.id,
    });

    // 3. Only process contact.created events
    if (parsed.event !== "contact.created") {
      return NextResponse.json({
        received: true,
        enrichmentTriggered: false,
        reason: `Event "${parsed.event}" ignored — only contact.created is processed`,
      });
    }

    // 4. Check if any user has auto-enrich enabled (system-level webhook)
    const enabledSettings = await prisma.appSettings.findFirst({
      where: { autoEnrichEnabled: true },
      select: {
        userId: true,
        autoEnrichMode: true,
      },
    });

    if (!enabledSettings) {
      return NextResponse.json({
        received: true,
        enrichmentTriggered: false,
        reason: "Auto-enrichment is disabled",
      });
    }

    const { userId, autoEnrichMode } = enabledSettings;
    const mode = (autoEnrichMode as "QUICK" | "DEEP") || "QUICK";
    const fullName = `${parsed.contact.firstName} ${parsed.contact.lastName}`;
    const companyName = parsed.contact.company?.name;

    // 5. Check for duplicate — skip if recent brief exists
    const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const existingBrief = await prisma.brief.findFirst({
      where: {
        sourceContactId: parsed.contact.id,
        userId,
        createdAt: { gte: cutoff },
      },
    });

    if (existingBrief) {
      logger.info("Webhook enrichment skipped — recent brief exists", {
        briefId: existingBrief.id,
        contactId: parsed.contact.id,
      });
      return NextResponse.json({
        received: true,
        enrichmentTriggered: false,
        reason: "Recent brief already exists for this contact",
        briefId: existingBrief.id,
      });
    }

    // 6. Trigger enrichment
    const input = companyName ? `${fullName} ${companyName}` : fullName;
    const briefId = await createAndRunBrief(input, mode, userId);

    // Update brief with sourceContactId
    await prisma.brief.update({
      where: { id: briefId },
      data: { sourceContactId: parsed.contact.id },
    });

    await logActivity({
      userId,
      type: "webhook_enriched",
      entityType: "brief",
      entityId: briefId,
      entityName: fullName,
      description: `Webhook auto-enriched ${mode} brief for "${fullName}"`,
    });

    await logAudit({
      userId,
      action: "brief.webhook_enrich",
      resource: "brief",
      resourceId: briefId,
      metadata: {
        contactId: parsed.contact.id,
        name: fullName,
        company: companyName,
        mode,
        event: parsed.event,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      received: true,
      enrichmentTriggered: true,
      briefId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation Error", issues: error.issues },
        { status: 400 },
      );
    }
    logger.api.error("POST", "/api/webhooks/crm", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
