/**
 * IntelBriefs - Personal Intelligence Briefing
 * Copyright (c) 2024-2026 Nick Falshaw
 */

import type { NextAuthConfig } from "next-auth";

const KNOWN_WEAK_SECRETS = [
  "changeme",
  "secret",
  "your-secret",
  "change-me",
  "test",
  "development",
  "password",
];

function validateAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

  if (
    process.env.NODE_ENV === "development" &&
    process.env.USE_MOCK_AUTH === "true"
  ) {
    if (secret) return secret;
    throw new Error(
      "AUTH_SECRET must be set even in mock auth mode.\n" +
        "Generate one with: openssl rand -base64 32",
    );
  }

  if (!secret) {
    throw new Error(
      "FATAL: AUTH_SECRET environment variable is not set.\n" +
        "Generate one with: openssl rand -base64 32\n" +
        "Then add it to your .env file.",
    );
  }
  if (secret.length < 32) {
    throw new Error(
      `FATAL: AUTH_SECRET is too short (${secret.length} chars). Minimum 32 characters required.\n` +
        "Generate with: openssl rand -base64 32",
    );
  }
  const lower = secret.toLowerCase();
  for (const weak of KNOWN_WEAK_SECRETS) {
    if (lower.includes(weak)) {
      throw new Error(`FATAL: AUTH_SECRET contains weak pattern '${weak}'.`);
    }
  }
  return secret;
}

const validatedSecret = validateAuthSecret();

export const authConfig: NextAuthConfig = {
  secret: validatedSecret,
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      const publicRoutes = ["/login", "/register"];
      // /api/cron/* is server-to-server: no session, each route checks CRON_SECRET itself (fail-closed).
      const publicApiRoutes = ["/api/auth", "/api/health", "/api/cron/"];

      if (publicRoutes.some((route) => pathname === route)) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/", nextUrl));
        }
        return true;
      }

      if (publicApiRoutes.some((route) => pathname.startsWith(route))) {
        return true;
      }

      if (!isLoggedIn) {
        const loginUrl = new URL("/login", nextUrl);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return Response.redirect(loginUrl);
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
};
