/**
 * IntelBriefs - Personal Intelligence Briefing
 * Copyright (c) 2024-2026 Nick Falshaw
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Redis from "ioredis";
import { getStatus as getOllamaStatus } from "@/lib/ollama";
import { checkCrmConnection } from "@/lib/crm-client";
import { auth } from "@/lib/auth";

const startTime = Date.now();

const LLM_PROVIDER = (process.env.LLM_PROVIDER || "ollama").toLowerCase();
const BRIDGE_URL =
  process.env.CLAUDE_BRIDGE_URL || "http://host.docker.internal:7777";

/**
 * Probe the shared CLI bridge once. Its `GET /health` returns
 * `{ ok, claude, qdrant, ... }`. Returns null if the bridge is unreachable.
 */
async function probeBridge(): Promise<{
  ok: boolean;
  claude?: boolean;
  qdrant?: boolean;
} | null> {
  try {
    const res = await fetch(`${BRIDGE_URL}/health`, {
      signal: AbortSignal.timeout(4000),
      headers: process.env.CLAUDE_BRIDGE_TOKEN
        ? { "X-Bridge-Token": process.env.CLAUDE_BRIDGE_TOKEN }
        : undefined,
    });
    if (!res.ok) return { ok: false };
    return (await res.json()) as {
      ok: boolean;
      claude?: boolean;
      qdrant?: boolean;
    };
  } catch {
    return null;
  }
}

export async function GET() {
  // Check if user is authenticated for detailed health info
  const session = await auth();
  const showDetails = !!session?.user;

  const checks: Record<
    string,
    { status: string; latency?: number; error?: string }
  > = {};

  // Database check
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = {
      status: "ok",
      ...(showDetails && { latency: Date.now() - dbStart }),
    };
  } catch (error) {
    checks.database = {
      status: "error",
      ...(showDetails && {
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }

  // Redis check
  try {
    const redisStart = Date.now();
    const redisUrl = process.env.REDIS_URL;
    const redisOpts = redisUrl
      ? { connectTimeout: 3000, lazyConnect: true }
      : {
          host: process.env.REDIS_HOST || "intelbriefs-redis",
          port: parseInt(process.env.REDIS_PORT || "6379", 10),
          password: process.env.REDIS_PASSWORD,
          connectTimeout: 3000,
          lazyConnect: true,
        };
    const redis = redisUrl
      ? new Redis(redisUrl, redisOpts)
      : new Redis(redisOpts);
    await redis.connect();
    await redis.ping();
    await redis.quit();
    checks.redis = {
      status: "ok",
      ...(showDetails && { latency: Date.now() - redisStart }),
    };
  } catch (error) {
    checks.redis = {
      status: "error",
      ...(showDetails && {
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }

  // LLM AI check — provider-aware and NON-FATAL.
  // A down LLM (or the bridge) must NOT mark the container unhealthy; the app
  // researches fine without AI synthesis. Only DB/Redis gate readiness.
  if (LLM_PROVIDER === "claude") {
    const bridgeStart = Date.now();
    const bridge = await probeBridge();
    if (bridge === null) {
      checks.ollama = {
        status: "error",
        ...(showDetails && {
          latency: Date.now() - bridgeStart,
          error: "bridge unreachable",
        }),
      };
    } else {
      const llmOk = bridge.ok && bridge.claude !== false;
      checks.ollama = {
        status: llmOk ? "ok" : "error",
        ...(showDetails && {
          latency: Date.now() - bridgeStart,
          ...(llmOk ? {} : { error: "bridge LLM path unavailable" }),
        }),
      };
    }
  } else {
    try {
      const ollamaStart = Date.now();
      const ollama = await getOllamaStatus();
      checks.ollama = {
        status: ollama.connected ? "ok" : "error",
        ...(showDetails && { latency: Date.now() - ollamaStart }),
      };
      if (!ollama.connected && showDetails) {
        checks.ollama.error = ollama.error || "Ollama service not responding";
      }
    } catch (error) {
      checks.ollama = {
        status: "error",
        ...(showDetails && {
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      };
    }
  }

  // CRM integration check (optional - not critical)
  try {
    const crmStart = Date.now();
    const crmConnected = await checkCrmConnection();
    checks.crm = {
      status: crmConnected ? "ok" : "warning",
      ...(showDetails && { latency: Date.now() - crmStart }),
    };
    if (!crmConnected && showDetails) {
      checks.crm.error = "CRM service not available (non-critical)";
    }
  } catch (error) {
    checks.crm = {
      status: "warning",
      ...(showDetails && {
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }

  // --- Readiness: only HARD deps (DB + Redis) gate the HTTP status. ---
  // The LLM (ollama) and CRM are soft: down means "degraded" (200), never 503.
  const hardOk =
    checks.database?.status === "ok" && checks.redis?.status === "ok";
  // CRM reports "warning" (non-critical) when offline — that alone is not a
  // soft failure, matching the prior behaviour where only db/redis/ollama
  // affected the reported status.
  const allOk = Object.values(checks).every(
    (c) => c.status === "ok" || c.status === "warning",
  );
  const httpStatus = hardOk ? 200 : 503;

  // Public response: minimal info for Docker health checks
  if (!showDetails) {
    return NextResponse.json(
      { status: !hardOk ? "unhealthy" : allOk ? "ok" : "degraded" },
      { status: httpStatus },
    );
  }

  // Authenticated response: full details
  return NextResponse.json(
    {
      status: !hardOk ? "unhealthy" : allOk ? "healthy" : "degraded",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: httpStatus },
  );
}
