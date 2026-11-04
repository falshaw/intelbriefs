/**
 * IntelBriefs - Source Quality Scoring (IB-05)
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * Single source score: DELETE to remove user override.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/session";
import { applyRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

// DELETE /api/sources/scores/[id] — Remove user score override
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const { id } = await params;

    const existing = await prisma.sourceScore.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.sourceScore.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("DELETE", "/api/sources/scores/[id]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
