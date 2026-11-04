/**
 * IntelBriefs - Personal Intelligence Briefing
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * Redis-backed rate limiter with automatic in-memory fallback.
 * Uses INCR + EXPIRE for atomic, distributed rate limiting when Redis is available.
 * Falls back to a local Map when Redis is unreachable.
 */

import { NextResponse } from "next/server";
import Redis from "ioredis";

type RequestLike = { headers: { get(name: string): string | null } };

export interface RateLimitConfig {
  interval: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Redis singleton — lazy-connect, suppress errors so the app never crashes
// ---------------------------------------------------------------------------

let redis: Redis | null = null;
let redisAvailable = true;

function getRedis(): Redis | null {
  if (!redisAvailable) return null;

  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      redisAvailable = false;
      return null;
    }

    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    redis.on("error", () => {
      // Silently degrade to in-memory — logged once below
    });

    redis.on("close", () => {
      redisAvailable = false;
      redis = null;
    });

    redis.connect().catch(() => {
      redisAvailable = false;
      redis = null;
      console.warn(
        "[rateLimit] Redis unavailable, falling back to in-memory store",
      );
    });
  }

  return redis;
}

// ---------------------------------------------------------------------------
// In-memory fallback store (same logic as before, used when Redis is down)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL = 60000;
let lastCleanup = Date.now();

function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.resetAt < now) memoryStore.delete(key);
  }
}

function checkRateLimitMemory(
  key: string,
  config: RateLimitConfig,
): { limited: boolean; remaining: number; resetAt: number } {
  cleanupExpiredEntries();
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || entry.resetAt < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.interval,
    };
    memoryStore.set(key, newEntry);
    return {
      limited: false,
      remaining: config.limit - 1,
      resetAt: newEntry.resetAt,
    };
  }

  entry.count++;
  if (entry.count > config.limit) {
    return { limited: true, remaining: 0, resetAt: entry.resetAt };
  }
  return {
    limited: false,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  };
}

// ---------------------------------------------------------------------------
// Redis-backed rate limit check (INCR + EXPIRE)
// ---------------------------------------------------------------------------

async function checkRateLimitRedis(
  client: Redis,
  key: string,
  config: RateLimitConfig,
): Promise<{ limited: boolean; remaining: number; resetAt: number }> {
  const windowSeconds = Math.ceil(config.interval / 1000);
  const redisKey = `rl:${key}`;

  // INCR is atomic — first call in the window creates the key with value 1
  const count = await client.incr(redisKey);

  if (count === 1) {
    // First request in window — set expiry
    await client.expire(redisKey, windowSeconds);
  }

  const ttl = await client.ttl(redisKey);
  const resetAt = Date.now() + ttl * 1000;

  if (count > config.limit) {
    return { limited: true, remaining: 0, resetAt };
  }
  return { limited: false, remaining: config.limit - count, resetAt };
}

// ---------------------------------------------------------------------------
// Client identification
// ---------------------------------------------------------------------------

function getClientId(req: RequestLike): string {
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      const ips = forwarded.split(",").map((ip) => ip.trim());
      return ips[ips.length - 1] || "unknown";
    }
    const realIp = req.headers.get("x-real-ip");
    if (realIp) return realIp;
  }
  return req.headers.get("x-real-ip") || "unknown";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function checkRateLimit(
  req: RequestLike,
  config: RateLimitConfig,
  prefix: string = "global",
): Promise<{ limited: boolean; remaining: number; resetAt: number }> {
  const key = `${prefix}:${getClientId(req)}`;
  const client = getRedis();

  if (client) {
    try {
      return await checkRateLimitRedis(client, key, config);
    } catch {
      // Redis call failed mid-request — fall back to memory for this check
    }
  }

  return checkRateLimitMemory(key, config);
}

export function rateLimitResponse(
  remaining: number,
  resetAt: number,
): NextResponse {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  return NextResponse.json(
    { error: "Too Many Requests", message: "Rate limit exceeded.", retryAfter },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
      },
    },
  );
}

export async function applyRateLimit(
  req: RequestLike,
  config: RateLimitConfig = RATE_LIMITS.api,
  prefix: string = "api",
): Promise<NextResponse | null> {
  const { limited, remaining, resetAt } = await checkRateLimit(
    req,
    config,
    prefix,
  );
  if (limited) return rateLimitResponse(remaining, resetAt);
  return null;
}

export const RATE_LIMITS = {
  auth: { interval: 60 * 1000, limit: 10 },
  api: { interval: 60 * 1000, limit: 100 },
  research: { interval: 60 * 1000, limit: 10 },
};
