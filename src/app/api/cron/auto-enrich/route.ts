/**
 * IntelBriefs - Personal Intelligence Briefing
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * GET /api/cron/auto-enrich — Polling-Based CRM Enrichment (IB-03)
 *
 * Runs every 15 minutes (external cron or scheduled call).
 * Fetches recent CRM contacts and enriches those without existing briefs.
 * Auth: CRON_SECRET header check.
 * Max 3 enrichments per run to avoid overload.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { crmGet } from "@/lib/crm-client";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { createAndRunBrief } from "@/lib/research/pipeline";

/** Max contacts to enrich per cron run */
const MAX_ENRICHMENTS_PER_RUN = 3;

/** Only look at contacts created in the last 24 hours */
const LOOKBACK_HOURS = 24;

/** Duplicate window — briefs for the same contact within 7 days are reused */
const DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface CrmContact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  company?: { name: string } | null;
  createdAt?: string;
}

interface CrmContactsResponse {
  data: CrmContact[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
  };
}

export async function GET(request: Request) {
  try {
    // 1. Auth check via CRON_SECRET (fail-closed: reject if not configured)
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: "CRON_SECRET not configured" },
        { status: 503 },
      );
    }
    const provided =
      request.headers.get("x-cron-secret") ||
      request.headers.get("Authorization")?.replace("Bearer ", "");
    if (provided !== cronSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    logger.api.request("GET", "/api/cron/auto-enrich", {});

    // 2. Check if any user has auto-enrich enabled
    const enabledSettings = await prisma.appSettings.findFirst({
      where: { autoEnrichEnabled: true },
      select: {
        userId: true,
        autoEnrichMode: true,
        crmUrl: true,
      },
    });

    if (!enabledSettings) {
      return NextResponse.json({
        processed: 0,
        enriched: 0,
        skipped: 0,
        reason: "Auto-enrichment is disabled",
      });
    }

    const { userId, autoEnrichMode } = enabledSettings;
    const mode = (autoEnrichMode as "QUICK" | "DEEP") || "QUICK";

    // 3. Fetch recent contacts from CRM (last 24h)
    const crmContacts = await crmGet<CrmContactsResponse>(
      `/api/contacts?limit=10&sort=createdAt:desc`,
    );

    if (!crmContacts?.data || crmContacts.data.length === 0) {
      return NextResponse.json({
        processed: 0,
        enriched: 0,
        skipped: 0,
        reason: "No recent CRM contacts found",
      });
    }

    // 4. Filter to contacts created within lookback window
    const lookbackCutoff = new Date(
      Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000,
    );
    const recentContacts = crmContacts.data.filter((c) => {
      if (!c.createdAt) return true; // Include if no timestamp (assume recent)
      return new Date(c.createdAt) >= lookbackCutoff;
    });

    let enriched = 0;
    let skipped = 0;
    const enrichedIds: string[] = [];

    // 5. Check each contact for existing briefs and enrich
    const duplicateCutoff = new Date(Date.now() - DUPLICATE_WINDOW_MS);

    for (const contact of recentContacts) {
      if (enriched >= MAX_ENRICHMENTS_PER_RUN) break;

      // Check if brief already exists for this contact
      const existingBrief = await prisma.brief.findFirst({
        where: {
          sourceContactId: contact.id,
          userId,
          createdAt: { gte: duplicateCutoff },
        },
      });

      if (existingBrief) {
        skipped++;
        continue;
      }

      // Trigger enrichment
      const fullName = `${contact.firstName} ${contact.lastName}`;
      const companyName = contact.company?.name;
      const input = companyName ? `${fullName} ${companyName}` : fullName;

      try {
        const briefId = await createAndRunBrief(input, mode, userId);

        await prisma.brief.update({
          where: { id: briefId },
          data: { sourceContactId: contact.id },
        });

        await logActivity({
          userId,
          type: "cron_enriched",
          entityType: "brief",
          entityId: briefId,
          entityName: fullName,
          description: `Cron auto-enriched ${mode} brief for "${fullName}"`,
        });

        await logAudit({
          userId,
          action: "brief.cron_enrich",
          resource: "brief",
          resourceId: briefId,
          metadata: {
            contactId: contact.id,
            name: fullName,
            company: companyName,
            mode,
          },
        });

        enriched++;
        enrichedIds.push(briefId);
      } catch (err) {
        logger.warn("Cron enrichment failed for contact", {
          contactId: contact.id,
          error: err instanceof Error ? err.message : String(err),
        });
        skipped++;
      }
    }

    const result = {
      processed: recentContacts.length,
      enriched,
      skipped,
      briefIds: enrichedIds,
    };

    logger.info("Cron auto-enrich complete", result);
    return NextResponse.json(result);
  } catch (error) {
    logger.api.error("GET", "/api/cron/auto-enrich", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
