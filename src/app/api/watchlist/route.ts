/**
 * IntelBriefs — Watchlist API (IB-01)
 * CRUD for watched contacts/companies with recurring brief schedules.
 */

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/session";
import { applyRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

function getNextRunAt(frequency: string, from: Date = new Date()): Date {
  const next = new Date(from);
  switch (frequency) {
    case "DAILY":
      next.setDate(next.getDate() + 1);
      break;
    case "WEEKLY":
      next.setDate(next.getDate() + 7);
      break;
    case "BIWEEKLY":
      next.setDate(next.getDate() + 14);
      break;
    case "MONTHLY":
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      next.setDate(next.getDate() + 7);
  }
  return next;
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional(),
  linkedinUrl: z.string().url().optional(),
  briefType: z.enum(["PERSON", "COMPANY"]).default("PERSON"),
  briefMode: z.enum(["QUICK", "DEEP"]).default("DEEP"),
  frequency: z
    .enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"])
    .default("WEEKLY"),
});

// POST /api/watchlist — Add item to watchlist
export async function POST(request: Request) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const item = await prisma.watchlistItem.create({
      data: {
        userId: user.id,
        name: parsed.name,
        company: parsed.company,
        linkedinUrl: parsed.linkedinUrl,
        briefType: parsed.briefType,
        briefMode: parsed.briefMode,
        frequency: parsed.frequency,
        nextRunAt: getNextRunAt(parsed.frequency),
      },
    });

    return NextResponse.json({ data: item }, { status: 201 });
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
    logger.api.error("POST", "/api/watchlist", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// GET /api/watchlist — List watchlist items
export async function GET(request: Request) {
  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const user = await requireUser();

    const items = await prisma.watchlistItem.findMany({
      where: { userId: user.id },
      include: {
        _count: { select: { runs: true } },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            brief: {
              select: {
                id: true,
                status: true,
                summary: true,
                createdAt: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: items });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.api.error("GET", "/api/watchlist", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export { getNextRunAt };
