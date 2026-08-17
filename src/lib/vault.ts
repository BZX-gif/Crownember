import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { settings, users, vaultAccess } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";
import type { AuthUser } from "@/lib/auth";

/**
 * THE VAULT — EMBERCROWN's password-sealed inner circle.
 *
 * Security model ("impossible to hack" by design):
 * - The passcode exists ONLY as an scrypt hash in the database. No client
 *   ever sees it, and timing-safe comparison defeats timing attacks.
 * - Unlock attempts are hard rate-limited at the route layer (5 / 15 min).
 * - Unlocking mints a random 32-byte access token stored server-side and
 *   delivered as an httpOnly cookie. Every vault request re-verifies the
 *   token against the database — there is nothing client-side to forge.
 */
export const VAULT_COOKIE = "ff_vault";
export const VAULT_ACCESS_DAYS = 7;
const VAULT_SETTING_KEY = "vault_passcode_hash";

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

export async function getVaultUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(VAULT_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ user: users })
    .from(vaultAccess)
    .innerJoin(users, eq(vaultAccess.userId, users.id))
    .where(eq(vaultAccess.token, token))
    .limit(1);
  return rows[0]?.user ?? null;
}
