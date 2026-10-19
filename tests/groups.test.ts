/**
 * Private groups — unit tests (no database, no network).
 *
 * These cover the parts of Slice A that must be right regardless of what the
 * database does: the permission matrix, the entitlement/limit maths, the
 * invitation state machine, image magic-byte validation, and the migration
 * SQL's safety properties (additive, idempotent, never destructive).
 *
 * The database-backed behaviour — row locks, capacity races, triggers,
 * privacy of guessed ids — lives in tests/groups.integration.test.ts and runs
 * when VYRON_TEST_DATABASE_URL points at a disposable database.
 *
 * Run: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ADMIN_GRANTABLE_PERMISSIONS,
  DEFAULT_ADMIN_PERMISSIONS,
  GROUP_MEMBER_STATES,
  GROUP_PERMISSIONS,
  MEMBER_PERMISSIONS,
  NO_CAPABILITIES,
  OWNER_ONLY_PERMISSIONS,
  canManageMember,
  capabilitiesFor,
  isGroupPermission,
  isGroupRole,
  normalizeAdminPermissions,
  outranks,
  roleHasPermission,
  rolePermissions,
} from "@/lib/groups/permissions";
import {
  ABSOLUTE_MEMBER_CEILING,
  FREE_MEMBER_LIMIT,
  PREMIUM_TEST_MEMBER_LIMIT,
  capacityFor,
  describeLimit,
  entitlementActive,
  isPremiumTier,
  memberLimitFor,
  tierFor,
} from "@/lib/groups/limits";
import {
  INVITATION_TTL_DAYS,
  decideInvitation,
  evaluateAcceptance,
  invitationExpiry,
  isExpired,
  isOpenInvitation,
} from "@/lib/groups/invitations";
import {
  MAX_IMAGE_BYTES,
  TEST_IMAGES,
  detectImageMime,
  safeServeMime,
  validateImageUpload,
} from "@/lib/images";
import { GROUP_NAME_PATTERN, validateGroupInput } from "@/lib/groups/validation";
// Relative on purpose: scripts/ is outside the `@/` (src) alias.
import { CORE_SCHEMA_SQL, GROUPS_SCHEMA_SQL, MIGRATION_SQL } from "../scripts/migrations/schema.mjs";

/* ------------------------------------------------------------------ *
 * Permissions
 * ------------------------------------------------------------------ */

test("groups: roles and permissions are a closed, validated vocabulary", () => {
  assert.equal(isGroupRole("owner"), true);
  assert.equal(isGroupRole("admin"), true);
  assert.equal(isGroupRole("member"), true);
  assert.equal(isGroupRole("superuser"), false);
  assert.equal(isGroupRole(undefined), false);
  assert.equal(isGroupRole("OWNER"), false); // case-sensitive, no accidental match

  assert.equal(isGroupPermission("deleteGroup"), true);
  assert.equal(isGroupPermission("dropTables"), false);
  assert.equal(GROUP_PERMISSIONS.length, 12);
  // No capability is both grantable to admins and owner-only.
  for (const permission of OWNER_ONLY_PERMISSIONS) {
    assert.equal(ADMIN_GRANTABLE_PERMISSIONS.includes(permission), false, permission);
  }
});

test("groups: owner holds every capability, including the undelegable ones", () => {
  const owner = capabilitiesFor("owner");
  for (const permission of GROUP_PERMISSIONS) {
    assert.equal(owner[permission], true, `owner should hold ${permission}`);
  }
  assert.equal(owner.isOwner, true);
  assert.equal(owner.isManager, true);
  assert.equal(roleHasPermission("owner", "deleteGroup"), true);
});

test("groups: a plain member participates and may propose, nothing else", () => {
  const member = capabilitiesFor("member");
  assert.equal(member.viewContent, true);
  assert.equal(member.invite, true);
  assert.equal(member.updateDetails, false);
  assert.equal(member.reviewInvitations, false);
  assert.equal(member.manageMembers, false);
  assert.equal(member.manageAdmins, false);
  assert.equal(member.transferOwnership, false);
  assert.equal(member.deleteGroup, false);
  assert.equal(member.isManager, false);
  assert.deepEqual([...MEMBER_PERMISSIONS].sort(), ["invite", "viewContent"]);
});

test("groups: an admin holds only what was explicitly granted", () => {
  const bare = capabilitiesFor("admin", []);
  assert.equal(bare.viewContent, true, "admins always see the group they are in");
  assert.equal(bare.invite, false);
  assert.equal(bare.manageMembers, false);
  assert.equal(bare.deleteGroup, false);
  assert.equal(bare.transferOwnership, false);

  const tuned = capabilitiesFor("admin", ["invite", "reviewInvitations", "moderate"]);
  assert.equal(tuned.invite, true);
  assert.equal(tuned.reviewInvitations, true);
  assert.equal(tuned.moderate, true);
  assert.equal(tuned.manageMembers, false, "not granted, so not held");
  assert.equal(tuned.isManager, true);
  assert.equal(tuned.isOwner, false);

  for (const permission of DEFAULT_ADMIN_PERMISSIONS) {
    assert.equal(capabilitiesFor("admin", DEFAULT_ADMIN_PERMISSIONS)[permission], true, permission);
  }
});

test("groups: a hand-edited admin row cannot mint owner-only capabilities", () => {
  const forged = capabilitiesFor("admin", [
    "transferOwnership",
    "deleteGroup",
    "manageAdmins",
    "manageEntitlements",
    "invite",
    "not_a_permission",
  ]);
  assert.equal(forged.transferOwnership, false);
  assert.equal(forged.deleteGroup, false);
  assert.equal(forged.manageAdmins, false);
  assert.equal(forged.manageEntitlements, false);
  assert.equal(forged.invite, true, "a legitimately grantable permission still works");

  const rejected = normalizeAdminPermissions(["transferOwnership", "invite"]);
  assert.equal(rejected.ok, false, "an owner-only capability must never be grantable");
  assert.deepEqual(rejected.rejected, ["transferOwnership"]);
  // viewContent is implied by the admin role, so it is not a grantable toggle.
  assert.equal(normalizeAdminPermissions(["viewContent"]).ok, false);

  const normalized = normalizeAdminPermissions(["invite", "invite", "moderate"]);
  assert.equal(normalized.ok, true);
  assert.deepEqual(normalized.permissions?.sort(), ["invite", "moderate"], "duplicates collapse");

  assert.equal(normalizeAdminPermissions("invite").ok, false);
  assert.equal(normalizeAdminPermissions(null).ok, false);
});

test("groups: rank rules decide who may manage whom", () => {
  const owner = { role: "owner" as const, capabilities: capabilitiesFor("owner") };
  const admin = {
    role: "admin" as const,
    capabilities: capabilitiesFor("admin", ["manageMembers"]),
  };
  const powerlessAdmin = { role: "admin" as const, capabilities: capabilitiesFor("admin", []) };
  const member = { role: "member" as const, capabilities: capabilitiesFor("member") };

  assert.equal(canManageMember(owner, { role: "admin" }), true);
  assert.equal(canManageMember(owner, { role: "member" }), true);
  assert.equal(canManageMember(owner, { role: "owner" }), false, "nobody manages the owner");
  assert.equal(canManageMember(admin, { role: "member" }), true);
  assert.equal(canManageMember(admin, { role: "admin" }), false, "equal ranks never act");
  assert.equal(canManageMember(admin, { role: "owner" }), false);
  assert.equal(canManageMember(powerlessAdmin, { role: "member" }), false, "no capability granted");
  assert.equal(canManageMember(member, { role: "member" }), false);

  assert.equal(outranks("owner", "admin"), true);
  assert.equal(outranks("admin", "admin"), false);
  assert.equal(outranks("member", "admin"), false);
});

test("groups: membership states are explicit — an invitation is never a membership", () => {
  // A membership row exists only in the `active` state: leaving or being
  // removed DELETES the row, so there is no stale "member" record that a
  // query could accidentally treat as access.
  assert.deepEqual([...GROUP_MEMBER_STATES], ["active", "left", "removed"]);
  assert.equal(rolePermissions("member").has("viewContent"), true);
  // `left` and `removed` are states of a *former* member; nothing in the
  // permission layer can produce capabilities without a row.
  assert.equal(capabilitiesFor("member").viewContent, true);
  assert.equal(NO_CAPABILITIES.viewContent, false);
});

test("groups: a non-member has no capabilities at all", () => {
  for (const [key, value] of Object.entries(NO_CAPABILITIES)) {
    assert.equal(value, false, `${key} must be false for a non-member`);
  }
  assert.equal(rolePermissions("member").size, MEMBER_PERMISSIONS.size);
});

/* ------------------------------------------------------------------ *
 * Limits and entitlements
 * ------------------------------------------------------------------ */

test("limits: free groups hold 25 members including the owner", () => {
  assert.equal(FREE_MEMBER_LIMIT, 25);
  assert.equal(memberLimitFor(null, null), FREE_MEMBER_LIMIT);
  assert.equal(memberLimitFor({ maxMembers: null }, undefined), FREE_MEMBER_LIMIT);
  assert.equal(capacityFor(1, FREE_MEMBER_LIMIT).seatsLeft, 24);
  assert.equal(capacityFor(25, FREE_MEMBER_LIMIT).full, true);
  assert.equal(describeLimit(null), "25 members");
});

test("limits: the premium test entitlement raises the cap to 100", () => {
  assert.equal(PREMIUM_TEST_MEMBER_LIMIT, 100);
  const entitlement = { tier: "premium_test", memberLimit: PREMIUM_TEST_MEMBER_LIMIT };
  assert.equal(memberLimitFor(null, entitlement), 100);
  assert.equal(isPremiumTier("premium_test"), true);
  assert.equal(isPremiumTier("free"), false);
  assert.equal(isPremiumTier(null), false);
  assert.equal(describeLimit(entitlement), "100 members · premium");
  assert.equal(capacityFor(25, memberLimitFor(null, entitlement)).seatsLeft, 75);
});

test("limits: an expired entitlement falls back to the free tier", () => {
  const expired = {
    tier: "premium_test",
    memberLimit: 100,
    expiresAt: new Date(Date.now() - 60_000),
  };
  assert.equal(entitlementActive(expired), false);
  assert.equal(memberLimitFor(null, expired), FREE_MEMBER_LIMIT);
  assert.equal(tierFor(expired), "free");

  const live = { tier: "premium_test", memberLimit: 100, expiresAt: new Date(Date.now() + 60_000) };
  assert.equal(entitlementActive(live), true);
  assert.equal(tierFor(live), "premium_test");
  assert.equal(memberLimitFor(null, live), 100);

  const openEnded = { tier: "premium_test", memberLimit: 100, expiresAt: null };
  assert.equal(entitlementActive(openEnded), true);
});

test("limits: a per-group override wins but can never mean unlimited", () => {
  assert.equal(memberLimitFor({ maxMembers: 12 }, null), 12);
  assert.equal(
    memberLimitFor({ maxMembers: 12 }, { tier: "premium_test", memberLimit: 100 }),
    12,
  );
  assert.equal(memberLimitFor({ maxMembers: 0 }, null), FREE_MEMBER_LIMIT, "0 is not a limit");
  assert.equal(memberLimitFor({ maxMembers: -5 }, null), FREE_MEMBER_LIMIT);
  assert.equal(memberLimitFor({ maxMembers: 1e9 }, null), ABSOLUTE_MEMBER_CEILING);
  // A bogus entitlement row cannot produce a nonsense limit either.
  assert.equal(memberLimitFor(null, { tier: "premium_test", memberLimit: 0 }), PREMIUM_TEST_MEMBER_LIMIT);
});

/* ------------------------------------------------------------------ *
 * Invitation state machine
 * ------------------------------------------------------------------ */

test("invitations: statuses are explicit and only open ones are actionable", () => {
  assert.equal(isOpenInvitation("proposed"), true);
  assert.equal(isOpenInvitation("invited"), true);
  for (const closed of ["accepted", "rejected", "revoked", "expired", "declined"]) {
    assert.equal(isOpenInvitation(closed), false, closed);
  }
  assert.equal(isOpenInvitation(undefined), false);
  assert.equal(INVITATION_TTL_DAYS, 7);
  const expiry = invitationExpiry(new Date("2026-10-19T00:00:00Z"));
  assert.equal(expiry.toISOString(), "2026-10-26T00:00:00.000Z");
  assert.equal(isExpired(expiry, new Date("2026-10-25T00:00:00Z")), false);
  assert.equal(isExpired(expiry, new Date("2026-10-27T00:00:00Z")), true);
});

test("invitations: approve moves proposed → invited and nothing else", () => {
  assert.deepEqual(decideInvitation({ status: "proposed", decision: "approve" }), {
    ok: true,
    status: "invited",
    already: false,
  });
  // Re-approving is idempotent, not an error and not a second invitation.
  const again = decideInvitation({ status: "invited", decision: "approve" });
  assert.equal(again.ok, true);
  assert.equal(again.ok && again.already, true);

  for (const status of ["accepted", "rejected", "revoked", "expired", "declined"]) {
    const refused = decideInvitation({ status, decision: "approve" });
    assert.equal(refused.ok, false, `${status} must not be approvable`);
  }
  const nonsense = decideInvitation({ status: "whatever", decision: "approve" });
  assert.equal(nonsense.ok, false);
  assert.equal(!nonsense.ok && nonsense.code, "not_found");
});

test("invitations: reject answers a proposal, revoke withdraws either phase", () => {
  assert.equal(decideInvitation({ status: "proposed", decision: "reject" }).ok, true);
  assert.equal(decideInvitation({ status: "invited", decision: "reject" }).ok, false);
  assert.equal(decideInvitation({ status: "proposed", decision: "revoke" }).ok, true);
  assert.equal(decideInvitation({ status: "invited", decision: "revoke" }).ok, true);
  assert.equal(decideInvitation({ status: "accepted", decision: "revoke" }).ok, false);
  const twice = decideInvitation({ status: "revoked", decision: "revoke" });
  assert.equal(twice.ok, true);
  assert.equal(twice.ok && twice.already, true);
});

test("invitations: an expired invitation cannot be decided", () => {
  const expired = { status: "proposed", decision: "approve" as const, expiresAt: new Date(Date.now() - 1000) };
  const result = decideInvitation(expired);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, "expired");
  assert.equal(decideInvitation({ ...expired, decision: "revoke" }).ok, false);
});

const INVITEE = 42;

test("invitations: acceptance requires an approved invitation for THIS invitee", () => {
  const invited = { status: "invited", inviteeId: INVITEE, expiresAt: new Date(Date.now() + 60_000) };
  assert.deepEqual(evaluateAcceptance({ invitation: invited, viewerId: INVITEE }), {
    ok: true,
    status: "accepted",
  });

  const someoneElse = evaluateAcceptance({ invitation: invited, viewerId: INVITEE + 1 });
  assert.equal(someoneElse.ok, false);
  assert.equal(!someoneElse.ok && someoneElse.code, "not_invitee");

  // The core privacy rule: a proposal that no manager approved grants nothing.
  const proposed = evaluateAcceptance({
    invitation: { ...invited, status: "proposed" },
    viewerId: INVITEE,
  });
  assert.equal(proposed.ok, false);
  assert.equal(!proposed.ok && proposed.code, "not_approved");

  assert.equal(evaluateAcceptance({ invitation: null, viewerId: INVITEE }).ok, false);
});

test("invitations: revoked, rejected, expired and replayed accepts are refused", () => {
  const base = { inviteeId: INVITEE, expiresAt: new Date(Date.now() + 60_000) };
  const cases: [string, string][] = [
    ["revoked", "revoked"],
    ["rejected", "revoked"],
    ["declined", "revoked"],
    ["accepted", "already_member"],
    ["expired", "expired"],
  ];
  for (const [status, code] of cases) {
    const verdict = evaluateAcceptance({ invitation: { ...base, status }, viewerId: INVITEE });
    assert.equal(verdict.ok, false, `${status} must be refused`);
    assert.equal(!verdict.ok && verdict.code, code, status);
  }
  const pastExpiry = evaluateAcceptance({
    invitation: { ...base, status: "invited", expiresAt: new Date(Date.now() - 1) },
    viewerId: INVITEE,
  });
  assert.equal(pastExpiry.ok, false);
  assert.equal(!pastExpiry.ok && pastExpiry.code, "expired");
});

test("invitations: acceptance re-checks membership, eligibility and capacity", () => {
  const invited = { status: "invited", inviteeId: INVITEE, expiresAt: new Date(Date.now() + 60_000) };

  const duplicate = evaluateAcceptance({ invitation: invited, viewerId: INVITEE, alreadyMember: true });
  assert.equal(!duplicate.ok && duplicate.code, "already_member");

  const banned = evaluateAcceptance({ invitation: invited, viewerId: INVITEE, accountEligible: false });
  assert.equal(!banned.ok && banned.code, "account_ineligible");

  const full = evaluateAcceptance({
    invitation: invited,
    viewerId: INVITEE,
    memberCount: FREE_MEMBER_LIMIT,
    memberLimit: FREE_MEMBER_LIMIT,
  });
  assert.equal(!full.ok && full.code, "group_full");

  const lastSeat = evaluateAcceptance({
    invitation: invited,
    viewerId: INVITEE,
    memberCount: FREE_MEMBER_LIMIT - 1,
    memberLimit: FREE_MEMBER_LIMIT,
  });
  assert.equal(lastSeat.ok, true, "the 25th seat belongs to whoever locks the row first");

  const premiumBoundary = evaluateAcceptance({
    invitation: invited,
    viewerId: INVITEE,
    memberCount: PREMIUM_TEST_MEMBER_LIMIT,
    memberLimit: PREMIUM_TEST_MEMBER_LIMIT,
  });
  assert.equal(!premiumBoundary.ok && premiumBoundary.code, "group_full");
});

/* ------------------------------------------------------------------ *
 * Upload security
 * ------------------------------------------------------------------ */

test("images: real PNG, JPEG and WebP are recognised from their bytes", () => {
  assert.equal(detectImageMime(TEST_IMAGES.png), "image/png");
  assert.equal(detectImageMime(TEST_IMAGES.jpeg), "image/jpeg");
  assert.equal(detectImageMime(TEST_IMAGES.webp), "image/webp");
  assert.equal(detectImageMime(Buffer.from([])), null);
  assert.equal(detectImageMime(null), null);
});

test("images: MIME spoofing is rejected — the client's type is never trusted", () => {
  const html = Buffer.from("<html><body><script>alert(document.cookie)</script></body></html>");
  const spoofed = validateImageUpload({ bytes: html, declaredType: "image/png" });
  assert.equal(spoofed.ok, false);
  assert.ok(!spoofed.ok && /not a real/i.test(spoofed.error));

  // A PNG signature glued to a script is still not a PNG: the first chunk must
  // be IHDR.
  const forged = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("XXXX<script>alert(1)</script>"),
  ]);
  assert.equal(detectImageMime(forged), null);

  // An SVG is not an accepted format (it can carry script), whatever it claims.
  const svg = Buffer.from('<?xml version="1.0"?><svg onload="alert(1)"/>');
  assert.equal(detectImageMime(svg), null);
  assert.equal(validateImageUpload({ bytes: svg, declaredType: "image/svg+xml" }).ok, false);

  // A real JPEG labelled as PNG is accepted, but stored/served as image/jpeg.
  const mislabelled = validateImageUpload({ bytes: TEST_IMAGES.jpeg, declaredType: "image/png" });
  assert.equal(mislabelled.ok, true);
  assert.equal(mislabelled.ok && mislabelled.mime, "image/jpeg");
});

test("images: size limits are enforced before anything is stored", () => {
  assert.equal(MAX_IMAGE_BYTES, 1024 * 1024);
  const tooBig = validateImageUpload({
    bytes: Buffer.concat([TEST_IMAGES.png, Buffer.alloc(MAX_IMAGE_BYTES)]),
    declaredType: "image/png",
  });
  assert.equal(tooBig.ok, false);
  assert.ok(!tooBig.ok && /under 1 MB/i.test(tooBig.error));
  assert.equal(validateImageUpload({ bytes: Buffer.alloc(0) }).ok, false);
});

test("images: serving re-sniffs the stored bytes, so legacy rows cannot be served as HTML", () => {
  assert.equal(safeServeMime(TEST_IMAGES.png, "image/png"), "image/png");
  assert.equal(safeServeMime(TEST_IMAGES.png, "text/html"), "image/png");
  assert.equal(safeServeMime(TEST_IMAGES.jpeg, null), "image/jpeg");
  assert.equal(safeServeMime(Buffer.from("not an image"), "image/png"), null);
});

/* ------------------------------------------------------------------ *
 * Group text validation
 * ------------------------------------------------------------------ */

test("groups: name and description validation is bounded and markup-free", () => {
  assert.equal(validateGroupInput({ name: "Midnight Squad" }).ok, true);
  assert.equal(validateGroupInput({ name: "ab" }).ok, false, "too short");
  assert.equal(validateGroupInput({ name: "" }).ok, false);
  assert.equal(validateGroupInput({ name: "x".repeat(49) }).ok, false, "too long");
  assert.equal(validateGroupInput({ name: "  spaced   name  " }).name, "spaced name");
  assert.equal(validateGroupInput({ name: "<script>alert(1)</script>" }).ok, false);
  assert.equal(validateGroupInput({ name: "ok", description: "<iframe src=x>" }).ok, false);
  assert.equal(validateGroupInput({ name: "ok", description: "y".repeat(321) }).ok, false);
  assert.equal(GROUP_NAME_PATTERN.test("Ranked · Squad 01"), true);
  assert.equal(GROUP_NAME_PATTERN.test("https://spam.example"), false);
  assert.equal(validateGroupInput({}).ok, false);
  assert.equal(validateGroupInput({ name: "!!!" }).ok, false, "must start and end with a letter or number");
});

/* ------------------------------------------------------------------ *
 * Migration safety
 * ------------------------------------------------------------------ */

const ALL_MIGRATION_SQL = MIGRATION_SQL.map((step: { name: string; sql: string }) => step.sql).join("\n");

test("migration: it creates the group tables, indexes and entitlement store", () => {
  for (const table of ["groups", "group_members", "group_invitations", "group_entitlements"]) {
    assert.match(ALL_MIGRATION_SQL, new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`), table);
  }
  for (const column of ["owner_id", "visibility", "picture_data", "picture_mime", "max_members"]) {
    assert.match(GROUPS_SCHEMA_SQL, new RegExp(column), column);
  }
  // One open invitation per (group, invitee) is enforced by the database.
  assert.match(GROUPS_SCHEMA_SQL, /CREATE UNIQUE INDEX IF NOT EXISTS group_invitations_open_idx/);
  assert.match(GROUPS_SCHEMA_SQL, /WHERE status IN \('proposed', 'invited'\)/i);
  for (const indexName of [
    "groups_owner_idx",
    "group_members_user_idx",
    "group_members_group_role_idx",
    "group_invitations_group_pending_idx",
    "group_invitations_invitee_pending_idx",
    "group_invitations_expiry_idx",
  ]) {
    assert.match(GROUPS_SCHEMA_SQL, new RegExp(`CREATE INDEX IF NOT EXISTS ${indexName}`), indexName);
  }
  // Foreign keys cascade, so nothing private outlives a deleted group.
  assert.match(
    GROUPS_SCHEMA_SQL,
    /group_id integer NOT NULL REFERENCES groups\(id\) ON DELETE CASCADE/,
    "memberships cascade with the group",
  );
  assert.match(
    GROUPS_SCHEMA_SQL,
    /invitee_id integer NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/,
    "invitations cascade with the account",
  );
  assert.match(
    GROUPS_SCHEMA_SQL,
    /granted_by integer REFERENCES users\(id\) ON DELETE SET NULL/,
    "an entitlement survives the operator who granted it",
  );
});

test("migration: every statement is additive — nothing is dropped or erased", () => {
  const sql = ALL_MIGRATION_SQL;
  assert.equal(/DROP\s+TABLE/i.test(sql), false, "no DROP TABLE");
  assert.equal(/DROP\s+COLUMN/i.test(sql), false, "no DROP COLUMN");
  assert.equal(/TRUNCATE/i.test(sql), false, "no TRUNCATE");
  assert.equal(/DELETE\s+FROM/i.test(sql), false, "no DELETE FROM");
  assert.equal(/DROP\s+INDEX/i.test(sql), false, "no DROP INDEX");
  assert.equal(/DROP\s+CONSTRAINT/i.test(sql), false, "no DROP CONSTRAINT");
  // DROP TRIGGER is allowed: a trigger definition holds no data, and dropping
  // before recreating is what makes the file replayable.
  assert.match(GROUPS_SCHEMA_SQL, /DROP TRIGGER IF EXISTS group_members_owner_guard/);

  // The only UPDATE/INSERT statements in the whole migration are the two
  // pre-existing room-classification lines, which never touch group data.
  const writes = sql
    .split(";")
    .filter((statement) => /^\s*(UPDATE|INSERT)/i.test(statement.replace(/--.*$/gm, "").trim()))
    .map((statement) => statement.replace(/\s+/g, " ").trim());
  assert.equal(writes.length, 2, `unexpected data writes: ${JSON.stringify(writes)}`);
  assert.ok(writes.every((statement) => /rooms/i.test(statement)));
});

test("migration: it is idempotent — every creation is guarded", () => {
  const statements = ALL_MIGRATION_SQL.split(";")
    .map((statement: string) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    const normalized = statement.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
    if (/^CREATE TABLE/i.test(normalized)) assert.match(normalized, /IF NOT EXISTS/i, normalized);
    if (/^CREATE (UNIQUE )?INDEX/i.test(normalized)) assert.match(normalized, /IF NOT EXISTS/i, normalized);
    if (/^ALTER TABLE .* ADD COLUMN/i.test(normalized)) assert.match(normalized, /IF NOT EXISTS/i, normalized);
    // Postgres has no ADD CONSTRAINT IF NOT EXISTS, so a bare one outside a
    // DO block would make the second run fail.
    if (/^ALTER TABLE[^$]*ADD CONSTRAINT/i.test(normalized)) {
      assert.ok(false, `ADD CONSTRAINT must be wrapped in a DO block: ${normalized.slice(0, 80)}`);
    }
  }
  // Every ADD CONSTRAINT lives inside a DO block with a duplicate_object guard.
  const constraintAdds = (ALL_MIGRATION_SQL.match(/ADD CONSTRAINT/g) ?? []).length;
  const duplicateGuards = (ALL_MIGRATION_SQL.match(/WHEN duplicate_object/g) ?? []).length;
  assert.ok(constraintAdds > 0);
  assert.equal(duplicateGuards, constraintAdds, "each ADD CONSTRAINT needs a duplicate_object guard");
  assert.match(ALL_MIGRATION_SQL, /CREATE OR REPLACE FUNCTION group_members_enforce_owner/);
  assert.match(ALL_MIGRATION_SQL, /CREATE OR REPLACE FUNCTION group_members_enforce_capacity/);
});

test("migration: the core VYRON schema is still fully present and unchanged in spirit", () => {
  for (const table of [
    "users",
    "sessions",
    "settings",
    "waitlist",
    "rooms",
    "messages",
    "topics",
    "replies",
    "topic_likes",
    "vault_access",
    "voice_notes",
    "friendships",
    "blocks",
    "direct_messages",
    "chat_message_reactions",
  ]) {
    assert.match(CORE_SCHEMA_SQL, new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`), table);
  }
  assert.match(CORE_SCHEMA_SQL, /avatar_data bytea/, "profile picture storage preserved");
  assert.match(CORE_SCHEMA_SQL, /is_vault boolean/, "the Vault stays a first-class room");
  assert.match(CORE_SCHEMA_SQL, /INSERT INTO rooms \(slug, name, description, is_vault\)/);
  assert.equal(MIGRATION_SQL.length, 2, "core first, groups second");
  assert.equal(MIGRATION_SQL[0].name, "core");
  assert.equal(MIGRATION_SQL[1].name, "groups");
});

test("migration: the file really exists on disk and matches what the runner imports", () => {
  const path = join(process.cwd(), "scripts", "migrations", "schema.mjs");
  const onDisk = readFileSync(path, "utf8");
  assert.match(onDisk, /export const GROUPS_SCHEMA_SQL/);
  assert.match(onDisk, /group_members_owner_leave_guard/);
  const runner = readFileSync(join(process.cwd(), "scripts", "migrate.mjs"), "utf8");
  assert.match(runner, /import \{ MIGRATION_SQL \} from "\.\/migrations\/schema\.mjs"/);
  assert.match(runner, /--dry-run/);
  assert.equal(/DROP TABLE|TRUNCATE/i.test(runner), false);
});
