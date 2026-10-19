import { randomBytes } from "crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

/**
 * Session cookie name is kept as `ff_session` on purpose: renaming it would
 * silently sign out every existing player. The brand lives in the UI, not in
 * cookie identifiers.
 */
export const SESSION_COOKIE = "ff_session";
export const SESSION_DAYS = 30;

/** httpOnly + lax + secure(in prod) — never readable or replayable from JS. */
export function sessionCookieOptions(maxAgeSeconds = SESSION_DAYS * 86400) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ token, userId, expiresAt });
  return token;
}

export type AuthUser = typeof users.$inferSelect;

/**
 * Request-scoped memoisation. A page renders its layout and its page body
 * in the same request; without this, every route paid for the same session
 * lookup twice. React cache is scoped to one server request, so it can never
 * leak one member's session to another.
 */
export const getSessionUser = cache(async function getSessionUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.token, token))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.token, token));
    return null;
  }
  // Permanently exiled users cannot hold a session anywhere.
  if (row.user.banned) {
    await db.delete(sessions).where(eq(sessions.token, token));
    return null;
  }
  return row.user;
});

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
}
