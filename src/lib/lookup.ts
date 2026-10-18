import { sql, type AnyColumn } from "drizzle-orm";

/**
 * Server-only lookup helpers.
 *
 * The naive `ilike(col, input)` pattern is DANGEROUS for usernames: `%` and
 * `_` are LIKE wildcards, and `_` is a legal character in our usernames.
 * "a_b" would match "axb", and login could land on the wrong account.
 * These helpers do a case-insensitive EXACT match with zero wildcard power.
 */

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;
export const NICKNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/** `lower(col) = lower(input)` — case-insensitive exact match, no wildcards. */
export function eqLower(column: AnyColumn, value: string) {
  return sql`lower(${column}) = ${value.toLowerCase()}`;
}
