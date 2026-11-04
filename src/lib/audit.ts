/**
 * IntelBriefs - Personal Intelligence Briefing
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * Audit logging service for security-relevant actions.
 * Separate from Activity (user-facing timeline) — AuditLog captures
 * IP address, structured metadata, and is intended for compliance review.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { logger } from "./logger";

interface AuditLogParams {
  userId: string;
  action: string; // e.g. "brief.create", "brief.delete", "brief.crm_sync"
  resource: string; // e.g. "brief", "settings"
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Extract client IP from a Request object.
 * Checks x-forwarded-for (behind reverse proxy), x-real-ip, then falls back to null.
 */
export function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can contain comma-separated list; first is the client
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return undefined;
}

/**
 * Write an audit log entry to the database.
 * This is fire-and-forget — audit logging failures should never
 * block the main request flow.
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId ?? null,
        metadata: (params.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (error) {
    // Never let audit failures propagate — log and move on
    logger.api.error("AUDIT", "logAudit", error);
  }
}
