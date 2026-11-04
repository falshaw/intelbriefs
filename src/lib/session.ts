/**
 * IntelBriefs - Personal Intelligence Briefing
 * Copyright (c) 2024-2026 Nick Falshaw
 */

import { auth } from "./auth";

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

export async function getSessionUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new AuthError();
  }
  return user;
}
