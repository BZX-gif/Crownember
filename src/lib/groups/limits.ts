/**
 * Group limits and entitlements — the ONLY place a member cap is defined.
 *
 * Routes, services and UI all ask here. There is no scattered `25` or `100`
 * anywhere else in the codebase, and nothing in this file is client-controlled:
 *
 *  - Free groups: FREE_MEMBER_LIMIT (25) active members, owner included.
 *  - Premium test tier: PREMIUM_TEST_MEMBER_LIMIT (100) initially.
 *  - A specific group's limit comes from its `group_entitlements` row when one
 *    exists and has not expired. That row can only be written by
 *    `scripts/group-entitlement.mjs`, run by an operator on the server. There
 *    is no HTTP endpoint that grants premium, and an `isPremium` flag from a
 *    browser would be ignored even if one were sent.
 *
 * Both defaults can be re-tuned per environment (VYRON_FREE_GROUP_MEMBER_LIMIT,
 * VYRON_PREMIUM_MEMBER_LIMIT) without touching code — the env is read on the
 * server only, never exposed to the client, and can only ever be operated by
 * whoever controls the deployment.
 */

export const FREE_TIER = "free";
export const PREMIUM_TEST_TIER = "premium_test";

export type GroupTier = typeof FREE_TIER | typeof PREMIUM_TEST_TIER | (string & {});

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/** Active members allowed in a group with no entitlement row. Owner included. */
export const FREE_MEMBER_LIMIT = positiveIntFromEnv("VYRON_FREE_GROUP_MEMBER_LIMIT", 25);

/** Active members allowed for the premium test entitlement. */
export const PREMIUM_TEST_MEMBER_LIMIT = positiveIntFromEnv(
  "VYRON_PREMIUM_MEMBER_LIMIT",
  100,
);

/** A hard ceiling so a mistyped env value can never mean "unlimited". */
export const ABSOLUTE_MEMBER_CEILING = 10_000;

export const PREMIUM_TIERS: readonly string[] = [PREMIUM_TEST_TIER];

export function isPremiumTier(tier: string | null | undefined): boolean {
  return Boolean(tier) && tier !== FREE_TIER && PREMIUM_TIERS.includes(String(tier));
}

/** Row shape read from `group_entitlements` (null/undefined = free tier). */
export interface EntitlementLike {
  tier: string;
  memberLimit: number;
  expiresAt?: Date | string | null;
}

export function entitlementActive(
  entitlement: EntitlementLike | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!entitlement) return false;
  if (!entitlement.expiresAt) return true;
  const expires =
    typeof entitlement.expiresAt === "string"
      ? new Date(entitlement.expiresAt)
      : entitlement.expiresAt;
  if (Number.isNaN(expires.getTime())) return true;
  return expires.getTime() > now.getTime();
}

/** The effective tier for a group: premium only while an entitlement is live. */
export function tierFor(
  entitlement: EntitlementLike | null | undefined,
  now: Date = new Date(),
): GroupTier {
  return entitlementActive(entitlement, now) ? entitlement!.tier : FREE_TIER;
}

/**
 * The authoritative member cap. `group.maxMembers` is an optional per-group
 * override (set by an operator) and always wins; otherwise the live
 * entitlement's limit, otherwise the free default.
 */
export function memberLimitFor(
  group: { maxMembers?: number | null } | null | undefined,
  entitlement: EntitlementLike | null | undefined,
  now: Date = new Date(),
): number {
  const override = group?.maxMembers;
  if (typeof override === "number" && Number.isInteger(override) && override > 0) {
    return Math.min(override, ABSOLUTE_MEMBER_CEILING);
  }
  if (entitlementActive(entitlement, now)) {
    const limit = Number(entitlement?.memberLimit);
    if (Number.isInteger(limit) && limit > 0) {
      return Math.min(limit, ABSOLUTE_MEMBER_CEILING);
    }
    return PREMIUM_TEST_MEMBER_LIMIT;
  }
  return FREE_MEMBER_LIMIT;
}

/** Human copy for the UI. Always derived — never hardcoded per component. */
export function describeLimit(input: {
  tier?: string | null;
  memberLimit?: number | null;
  maxMembers?: number | null;
} | null): string {
  const limit = memberLimitFor(
    { maxMembers: input?.maxMembers ?? null },
    input
      ? {
          tier: input.tier ?? FREE_TIER,
          memberLimit: input.memberLimit ?? FREE_MEMBER_LIMIT,
        }
      : null,
  );
  const premium = isPremiumTier(input?.tier) && limit > FREE_MEMBER_LIMIT;
  return `${limit} member${limit === 1 ? "" : "s"}${premium ? " · premium" : ""}`;
}

/* ------------------------------------------------------------------ *
 * Group text limits. They live here (not in the service) because forms
 * need the same numbers the server enforces, and this module has no
 * database import — safe for a client component to read.
 * ------------------------------------------------------------------ */

export const MIN_GROUP_NAME = 3;
export const MAX_GROUP_NAME = 48;
export const MAX_GROUP_DESCRIPTION = 320;

/** Capacity maths used by the invitation and acceptance paths. */
export function capacityFor(memberCount: number, limit: number) {
  const seatsLeft = Math.max(0, limit - memberCount);
  return { memberCount, limit, seatsLeft, full: seatsLeft === 0 };
}
