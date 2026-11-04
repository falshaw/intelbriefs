/**
 * IntelBriefs - Brief Templates (IB-04)
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * Single template: GET, PATCH update, DELETE.
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

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z
    .enum(["PRE_MEETING", "INVESTOR", "COMPETITOR", "HIRING_MANAGER", "CUSTOM"])
    .optional(),
  description: z.string().max(500).optional(),
  sections: z.array(sectionSchema).min(1).max(20).optional(),
  isDefault: z.boolean().optional(),
});

// GET /api/templates/[id] — Get single template
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const { id } = await params;

    const template = await prisma.briefTemplate.findFirst({
      where: { id, userId: user.id },
    });

    if (!template) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ data: template });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("GET", "/api/templates/[id]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// PATCH /api/templates/[id] — Update template
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await prisma.briefTemplate.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.type !== undefined) data.type = parsed.type;
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.sections !== undefined)
      data.sections = JSON.parse(JSON.stringify(parsed.sections));
    if (parsed.isDefault !== undefined) {
      data.isDefault = parsed.isDefault;
      // Unset other defaults of same type
      if (parsed.isDefault) {
        await prisma.briefTemplate.updateMany({
          where: {
            userId: user.id,
            type: parsed.type || existing.type,
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        });
      }
    }

    const updated = await prisma.briefTemplate.update({
      where: { id },
      data,
    });

    return NextResponse.json({ data: updated });
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
    logger.api.error("PATCH", "/api/templates/[id]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// DELETE /api/templates/[id] — Remove template
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const { id } = await params;

    const existing = await prisma.briefTemplate.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.briefTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("DELETE", "/api/templates/[id]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
