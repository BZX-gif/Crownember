import { randomBytes } from "crypto";
import { cache } from "react";
import { and, eq, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { settings, users, vaultAccess } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";
import type { AuthUser } from "@/lib/auth";

/**
 * THE VAULT — VYRON's password-sealed inner circle.
 *
 * Security model:
 * - The passcode exists ONLY as an scrypt hash in the database. No client
 *   ever sees it, and timing-safe comparison defeats timing attacks.
 * - Unlock attempts are hard rate-limited at the route layer (5 / 15 min).
 * - Unlocking mints a random 32-byte access token stored server-side and
 *   delivered as an httpOnly cookie. Every vault request re-verifies the
 *   token against the database AND its age — there is nothing client-side
 *   to forge, and tokens die after VAULT_ACCESS_DAYS even if the cookie
 *   survives.
 * - Rotating the passcode revokes every live vault token. A leaked old key
 *   (or a stolen token) never outlives a rotation.
 *
 * Cookie name `ff_vault` is kept stable so existing members stay signed in
 * across deploys — the brand lives in the UI, not in cookie identifiers.
 */
export const VAULT_COOKIE = "ff_vault";
export const VAULT_ACCESS_DAYS = 7;
const VAULT_SETTING_KEY = "vault_passcode_hash";

export function vaultCookieOptions(maxAgeSeconds = VAULT_ACCESS_DAYS * 86400) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function getVaultPasscodeHash(): Promise<string | null> {
  const rows = await db
    .select()
    .from(settings)
    .where(eq(settings.key, VAULT_SETTING_KEY))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function setVaultPasscode(passcode: string): Promise<void> {
  const hash = hashPassword(passcode);
  const existing = await db
    .select({ key: settings.key })
    .from(settings)
    .where(eq(settings.key, VAULT_SETTING_KEY))
    .limit(1);
  if (existing[0]) {
    await db
      .update(settings)
      .set({ value: hash })
      .where(eq(settings.key, VAULT_SETTING_KEY));
  } else {
    await db
      .insert(settings)
      .values({ key: VAULT_SETTING_KEY, value: hash });
  }
}

export async function verifyVaultPasscode(
  passcode: string,
): Promise<boolean> {
  const hash = await getVaultPasscodeHash();
  if (!hash) return false;
  return verifyPassword(passcode, hash);
}

export async function mintVaultToken(userId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.insert(vaultAccess).values({ token, userId });
  return token;
}

/** Key rotation / lockout: every live vault token dies immediately. */
export async function revokeAllVaultTokens(): Promise<void> {
  await db.delete(vaultAccess);
}

/** Lazy cleanup so dead tokens can't pile up in the free database. */
export async function purgeExpiredVaultTokens(): Promise<void> {
  const cutoff = new Date(
    Date.now() - VAULT_ACCESS_DAYS * 24 * 60 * 60 * 1000,
  );
  await db.delete(vaultAccess).where(lt(vaultAccess.createdAt, cutoff));
}

/** Request-scoped: the vault page and chat API never verify the same token twice. */
export const getVaultUser = cache(async function getVaultUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(VAULT_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ access: vaultAccess, user: users })
    .from(vaultAccess)
    .innerJoin(users, eq(vaultAccess.userId, users.id))
    .where(eq(vaultAccess.token, token))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // Server-side expiry — the cookie's max-age is convenience, not authority.
  const maxAge = VAULT_ACCESS_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() - row.access.createdAt.getTime() > maxAge) {
    await db
      .delete(vaultAccess)
      .where(eq(vaultAccess.token, token));
    return null;
  }
  if (row.user.banned) {
    await db
      .delete(vaultAccess)
      .where(and(eq(vaultAccess.userId, row.user.id)));
    return null;
  }
  return row.user;});
