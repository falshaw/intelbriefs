/**
 * IntelBriefs - Personal Intelligence Briefing
 * Copyright (c) 2024-2026 Nick Falshaw
 */

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/session";
import { encrypt } from "@/lib/crypto";
import { applyRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

/** Allowed root directories for local file scanning */
const ALLOWED_SCAN_ROOTS = ["docs/", "notes/"];

const updateSettingsSchema = z.object({
  tavilyApiKey: z.string().optional(),
  exaApiKey: z.string().optional(),
  crmUrl: z.string().url().optional(),
  crmAuthToken: z.string().optional(),
  backgroundProfile: z.string().max(2000).optional(),
  defaultMode: z.enum(["QUICK", "DEEP"]).optional(),
  autoEnrichEnabled: z.boolean().optional(),
  autoEnrichMode: z.enum(["QUICK", "DEEP"]).optional(),
  localScanPaths: z
    .array(
      z.string().refine(
        (p) => {
          // Block path traversal and absolute paths
          const normalized = p.replace(/\\/g, "/");
          if (normalized.includes("..") || normalized.startsWith("/"))
            return false;
          return ALLOWED_SCAN_ROOTS.some((root) => normalized.startsWith(root));
        },
        `Path must start with one of: ${ALLOWED_SCAN_ROOTS.join(", ")}`,
      ),
    )
    .optional(),
});

// GET /api/settings
export async function GET(request: Request) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();

    let settings = await prisma.appSettings.findUnique({
      where: { userId: user.id },
    });

    if (!settings) {
      settings = await prisma.appSettings.create({
        data: {
          userId: user.id,
          backgroundProfile: "",
          defaultMode: "QUICK",
          localScanPaths: ["docs/", "notes/"],
        },
      });
    }

    return NextResponse.json({
      ...settings,
      tavilyApiKey: settings.tavilyApiKey ? "***configured***" : null,
      exaApiKey: settings.exaApiKey ? "***configured***" : null,
      crmAuthToken: settings.crmAuthToken ? "***configured***" : null,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("GET", "/api/settings", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// PUT /api/settings
export async function PUT(request: Request) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = updateSettingsSchema.parse(body);

    const dataToStore: Record<string, unknown> = { ...parsed };
    if (parsed.tavilyApiKey) {
      dataToStore.tavilyApiKey = encrypt(parsed.tavilyApiKey);
    }
    if (parsed.exaApiKey) {
      dataToStore.exaApiKey = encrypt(parsed.exaApiKey);
    }
    if (parsed.crmAuthToken) {
      dataToStore.crmAuthToken = encrypt(parsed.crmAuthToken);
    }

    const settings = await prisma.appSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...dataToStore,
      },
      update: dataToStore,
    });

    return NextResponse.json({
      ...settings,
      tavilyApiKey: settings.tavilyApiKey ? "***configured***" : null,
      exaApiKey: settings.exaApiKey ? "***configured***" : null,
      crmAuthToken: settings.crmAuthToken ? "***configured***" : null,
    });
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
    logger.api.error("PUT", "/api/settings", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
