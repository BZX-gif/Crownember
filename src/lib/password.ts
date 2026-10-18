import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * scrypt password hashing — salted, timing-safe verification.
 * Stored format: `<salt-hex>:<hash-hex>`. Never store or log the plaintext.
 */

// Upper bound so a giant body can't turn scrypt into a CPU weapon.
export const MAX_PASSWORD_LENGTH = 256;

/**
 * A real scrypt hash of a random throwaway secret. Login verifies against
 * this when the account doesn't exist so "no such user" and "wrong password"
 * cost the same time — no username oracle through response timing.
 */
export const DUMMY_PASSWORD_HASH = (() => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(randomBytes(32).toString("hex"), salt, 64).toString(
    "hex",
  );
  return `${salt}:${hash}`;
})();

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    );
  } catch {
    return false;
  }
}
