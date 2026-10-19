/**
 * Premium entitlement provisioning — OPERATOR ONLY.
 *
 * This is the trusted server-side mechanism the product spec requires: there
 * is deliberately no HTTP route that can write `group_entitlements`. Someone
 * with shell access to the deployment (or a database console) runs this file.
 * A client can never make itself premium, because nothing a client sends is
 * read here.
 *
 * Usage:
 *   npx tsx scripts/group-entitlement.ts grant  <groupId> [memberLimit]
 *   npx tsx scripts/group-entitlement.ts revoke <groupId>
 *   npx tsx scripts/group-entitlement.ts list
 *
 * `memberLimit` is optional; it defaults to the centrally configured premium
 * limit (PREMIUM_TEST_MEMBER_LIMIT, overridable with VYRON_PREMIUM_MEMBER_LIMIT).
 */
import "dotenv/config";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../src/db/index";
import { groupEntitlements, groups } from "../src/db/schema";
import {
  PREMIUM_TEST_MEMBER_LIMIT,
  PREMIUM_TEST_TIER,
  describeLimit,
} from "../src/lib/groups/limits";

const [command, idArg, limitArg] = process.argv.slice(2);

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

async function findGroup(groupId: number) {
  const rows = await db
    .select({ id: groups.id, name: groups.name, ownerId: groups.ownerId })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  return rows[0] ?? null;
}

async function main() {
  if (command === "list") {
    const rows = await db
      .select({
        groupId: groupEntitlements.groupId,
        tier: groupEntitlements.tier,
        memberLimit: groupEntitlements.memberLimit,
        expiresAt: groupEntitlements.expiresAt,
        name: groups.name,
      })
      .from(groupEntitlements)
      .innerJoin(groups, eq(groups.id, groupEntitlements.groupId))
      .where(
        or(isNull(groupEntitlements.expiresAt), sql`${groupEntitlements.expiresAt} > now()`),
      );
    if (rows.length === 0) {
      console.log(`No premium entitlements. Free limit: ${describeLimit(null)}.`);
    }
    for (const row of rows) {
      const expiry = row.expiresAt ? ` until ${row.expiresAt.toISOString()}` : " (no expiry)";
      console.log(`#${row.groupId} ${row.name} — ${row.tier}, ${row.memberLimit} members${expiry}`);
    }
    process.exit(0);
  }

  const groupId = Number(idArg);
  if (!Number.isInteger(groupId) || groupId <= 0) fail("A numeric group id is required.");
  const group = await findGroup(groupId);
  if (!group) fail(`No group with id ${groupId}.`);

  if (command === "grant") {
    const requested = limitArg === undefined ? null : Number(limitArg);
    if (requested !== null && (!Number.isInteger(requested) || requested <= 0)) {
      fail("memberLimit must be a positive whole number.");
    }
    const memberLimit = requested ?? PREMIUM_TEST_MEMBER_LIMIT;
    const [row] = await db
      .insert(groupEntitlements)
      .values({ groupId, tier: PREMIUM_TEST_TIER, memberLimit })
      .onConflictDoUpdate({
        target: groupEntitlements.groupId,
        set: { tier: PREMIUM_TEST_TIER, memberLimit, expiresAt: null, grantedAt: new Date() },
      })
      .returning();
    console.log(
      `✅ granted ${row.tier} to group #${groupId} (${group.name}) — ${describeLimit(row)}`,
    );
    process.exit(0);
  }

  if (command === "revoke") {
    const deleted = await db
      .delete(groupEntitlements)
      .where(and(eq(groupEntitlements.groupId, groupId)))
      .returning({ groupId: groupEntitlements.groupId });
    if (deleted.length === 0) {
      console.log(`Group #${groupId} (${group.name}) has no entitlement — already on the free tier.`);
    } else {
      console.log(`✅ revoked premium from group #${groupId} (${group.name}) — back to ${describeLimit(null)}.`);
    }
    console.log(
      "Note: existing members are never removed by a downgrade; the limit only applies to new joins.",
    );
    process.exit(0);
  }

  fail("Usage: grant <groupId> [memberLimit] | revoke <groupId> | list");
}

main().catch((err) => {
  console.error("❌ group-entitlement failed:", err?.message ?? err);
  process.exit(1);
});
