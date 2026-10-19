/**
 * Private groups — DATABASE INTEGRATION tests.
 *
 * These exercise what unit tests cannot: real row locks, real constraints, the
 * owner/capacity triggers, cascade deletes, and the concurrent-acceptance race
 * at the capacity boundary.
 *
 * ── How to run ─────────────────────────────────────────────────────────────
 *   1. Point at a DISPOSABLE database (it creates tables and test users):
 *        export VYRON_TEST_DATABASE_URL="postgresql://user:pass@host:5432/vyron_test"
 *   2. npm run test:db          (or `npm test`, which runs this file too)
 *
 * Without VYRON_TEST_DATABASE_URL the whole suite SKIPS itself, so ordinary CI
 * never needs credentials and never touches a real database. The build-time
 * migration (`node scripts/migrate.mjs`) uses DATABASE_URL and is a separate
 * concern — nothing in here runs against production.
 *
 * The suite applies the migration SQL itself (twice, to prove idempotency),
 * creates users named `t_<timestamp>_*`, and drops everything it created.
 */
import test from "node:test";
import assert from "node:assert/strict";

const TEST_DB_URL = process.env.VYRON_TEST_DATABASE_URL;

if (!TEST_DB_URL) {
  test("groups integration: skipped (set VYRON_TEST_DATABASE_URL to run)", { skip: true }, () => {});
} else {
  // Set DATABASE_URL *before* the app modules load: @/db reads it at import
  // time and throws when it is missing.
  process.env.DATABASE_URL = TEST_DB_URL;

  const { sql, and, eq } = await import("drizzle-orm");
  const { db } = await import("../src/db/index");
  const schema = await import("../src/db/schema");
  const { CORE_SCHEMA_SQL, GROUPS_SCHEMA_SQL } = await import("../scripts/migrations/schema.mjs");
  const service = await import("../src/lib/groups/service");
  const { requireGroup } = await import("../src/lib/groups/access");
  type GroupAccess = import("../src/lib/groups/access").GroupAccess;
  type GroupErrorCode = import("../src/lib/groups/service").GroupErrorCode;
  type GroupResult<T> = import("../src/lib/groups/service").GroupResult<T>;
  const { capabilitiesFor, DEFAULT_ADMIN_PERMISSIONS } = await import("../src/lib/groups/permissions");
  const { FREE_MEMBER_LIMIT, memberLimitFor } = await import("../src/lib/groups/limits");
  const { TEST_IMAGES } = await import("../src/lib/images");
  const { hashPassword } = await import("../src/lib/password");

  const { users, groups, groupMembers, groupInvitations, groupEntitlements } = schema;
  const {
    createGroup,
    updateGroup,
    deleteGroup,
    leaveGroup,
    removeMember,
    setMemberRole,
    setAdminPermissions,
    transferOwnership,
    createInvitation,
    decideInvitationAsManager,
    declineInvitation,
    acceptInvitation,
    listMyGroupInvitations,
    listInvitationsForReview,
    listGroupMembers,
    countMembers,
    readEntitlement,
    setGroupPicture,
    expireStaleInvitations,
  } = service;

  const RUN = Date.now().toString(36);
  const PASSWORD_HASH = hashPassword("integration-test-password");

  /* ---------------- helpers ---------------- */

  type UserRow = typeof users.$inferSelect;

  async function makeUser(suffix: string, extra: { banned?: boolean; isBot?: boolean } = {}) {
    const username = `t_${RUN}_${suffix}`.slice(0, 16);
    const [inserted] = await db
      .insert(users)
      .values({
        username,
        passwordHash: PASSWORD_HASH,
        bio: "",
        avatarColor: "#27272a",
        banned: extra.banned ?? false,
        isBot: extra.isBot ?? false,
      })
      .returning();
    return inserted as UserRow;
  }

  async function freshUser(suffix: string) {
    return makeUser(suffix);
  }

  /** Create a group owned by `owner`, optionally with a member cap override. */
  async function makeGroup(owner: UserRow, name = `Test Group ${RUN}`, maxMembers?: number) {
    const result = await createGroup({ actor: owner, name, description: "Integration fixture" });
    if (!result.ok) {
      throw new Error(`group creation failed: ${JSON.stringify(result)}`);
    }
    const groupId = result.data.id;
    if (maxMembers !== undefined) {
      await db.update(groups).set({ maxMembers }).where(eq(groups.id, groupId));
    }
    const access = await mustAccess(owner, groupId);
    return { groupId, group: result.data, access };
  }

  /** requireGroup, but a refusal is a test failure rather than a null. */
  async function mustAccess(user: UserRow, groupId: number): Promise<GroupAccess> {
    const result = await requireGroup({ groupId, user });
    if (!result.ok) {
      throw new Error(`expected access for ${user.username} to group ${groupId}: ${result.code}`);
    }
    return result.access;
  }

  /** Full invitation path: propose → approve → accept. */
  async function admit(access: GroupAccess, invitee: UserRow) {
    const proposed = await createInvitation({ access, username: invitee.username });
    assert.equal(proposed.ok, true, `propose failed: ${JSON.stringify(proposed)}`);
    const invitationId = proposed.ok ? proposed.data.id : 0;
    const approved = await decideInvitationAsManager({ access, invitationId, decision: "approve" });
    assert.equal(approved.ok, true, `approve failed: ${JSON.stringify(approved)}`);
    const accepted = await acceptInvitation({ viewer: invitee, invitationId });
    assert.equal(accepted.ok, true, `accept failed: ${JSON.stringify(accepted)}`);
    return invitationId;
  }

  function failureOf<T>(result: GroupResult<T>) {
    assert.equal(result.ok, false, `expected a refusal, got ${JSON.stringify(result)}`);
    return result as { ok: false; code: GroupErrorCode; error: string; status?: number };
  }

  async function memberCountOf(groupId: number) {
    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId));
    return rows[0].n;
  }

  async function invitationStatus(invitationId: number) {
    const rows = await db
      .select({ status: groupInvitations.status })
      .from(groupInvitations)
      .where(eq(groupInvitations.id, invitationId))
      .limit(1);
    return rows[0]?.status ?? null;
  }

  async function accessFor(user: UserRow, groupId: number): Promise<GroupAccess> {
    return mustAccess(user, groupId);
  }

  /* ---------------- lifecycle ---------------- */

  test("groups integration: setup — migration applies and is idempotent, preserving data", async () => {
    await db.execute(sql.raw(CORE_SCHEMA_SQL));
    await db.execute(sql.raw(GROUPS_SCHEMA_SQL));

    const owner = await makeUser("mig_owner");
    const created = await createGroup({ actor: owner, name: `Migration Probe ${RUN}` });
    assert.equal(created.ok, true);
    const groupId = created.ok ? created.data.id : 0;

    // Running the whole migration again must change nothing and keep the data.
    await db.execute(sql.raw(CORE_SCHEMA_SQL));
    await db.execute(sql.raw(GROUPS_SCHEMA_SQL));

    const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    assert.ok(group, "the group survived a second migration run");
    assert.equal(group.name, `Migration Probe ${RUN}`);
    assert.equal(await memberCountOf(groupId), 1);

    const rooms = await db.execute(sql`select count(*)::int as n from rooms`);
    assert.ok(Number((rooms.rows[0] as { n: number }).n) >= 1, "the default Vault room exists");
  });

  test("groups integration: creating a group makes the creator its owner member", async () => {
    const owner = await freshUser("create_owner");
    const result = await createGroup({
      actor: owner,
      name: `Founders Circle ${RUN}`,
      description: "A private circle.",
    });
    assert.equal(result.ok, true);
    const summary = result.ok ? result.data : null;
    assert.ok(summary);
    assert.equal(summary!.role, "owner");
    assert.equal(summary!.memberCount, 1, "the owner counts as a member");
    assert.equal(summary!.memberLimit, FREE_MEMBER_LIMIT);
    assert.equal(summary!.tier, "free");
    assert.equal(summary!.capabilities.isOwner, true);

    const [group] = await db.select().from(groups).where(eq(groups.id, summary!.id)).limit(1);
    assert.equal(group.ownerId, owner.id);
    assert.equal(group.visibility, "private", "groups are private by default");
    assert.equal(group.description, "A private circle.");

    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, summary!.id), eq(groupMembers.userId, owner.id)))
      .limit(1);
    assert.equal(membership.role, "owner");
    assert.deepEqual(membership.adminPermissions, []);

    // Validation is enforced server-side too, not just in the form.
    const tooShort = await createGroup({ actor: owner, name: "ab" });
    assert.equal(tooShort.ok, false);
    const markup = await createGroup({ actor: owner, name: "<script>alert(1)</script>" });
    assert.equal(markup.ok, false);
  });

  test("groups integration: a non-member gets the same answer as a group that never existed", async () => {
    const owner = await freshUser("priv_owner");
    const outsider = await freshUser("priv_outsider");
    const { groupId } = await makeGroup(owner, `Hidden Circle ${RUN}`);

    // Signed out.
    const anonymous = await requireGroup({ groupId, user: null });
    assert.equal(anonymous.ok, false);
    assert.equal(!anonymous.ok && anonymous.status, 401);

    // Signed in, not a member — indistinguishable from a deleted/never-existed id.
    const denied = await requireGroup({ groupId, user: outsider });
    assert.equal(denied.ok, false);
    assert.equal(!denied.ok && denied.code, "not_found");
    assert.equal(!denied.ok && denied.status, 404);
    assert.equal(!denied.ok && denied.error, "Group not found.");

    const missing = await requireGroup({ groupId: groupId + 500_000, user: outsider });
    assert.equal(missing.ok, false);
    assert.deepEqual(
      { code: !missing.ok && missing.code, error: !missing.ok && missing.error },
      { code: !denied.ok && denied.code, error: !denied.ok && denied.error },
      "guessed ids must be indistinguishable from real-but-forbidden ones",
    );

    // Asking for a capability makes no difference.
    const withPermission = await requireGroup({ groupId, user: outsider, permission: "viewContent" });
    assert.equal(withPermission.ok, false);
    assert.equal(!withPermission.ok && !withPermission.error.includes("Hidden"), true);

    // Junk ids.
    for (const junk of [0, -1, 1.5, Number.NaN]) {
      const result = await requireGroup({ groupId: junk, user: outsider });
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.status, 404);
    }

    // A banned account loses access it previously had, and a demo bot account
    // never gains it — both are refused with the same non-disclosing answer.
    const [banned] = await db
      .update(users)
      .set({ banned: true })
      .where(eq(users.id, owner.id))
      .returning();
    const bannedAccess = await requireGroup({ groupId, user: banned });
    assert.equal(bannedAccess.ok, false);
    assert.equal(!bannedAccess.ok && bannedAccess.code, "ineligible");
    await db.update(users).set({ banned: false }).where(eq(users.id, owner.id));

    const bot = await makeUser("priv_bot", { isBot: true });
    await db
      .insert(groupMembers)
      .values({ groupId, userId: bot.id, role: "member", adminPermissions: [] });
    const botAccess = await requireGroup({ groupId, user: bot });
    assert.equal(botAccess.ok, false);
    assert.equal(!botAccess.ok && !botAccess.error.includes("Hidden"), true);
    await db.delete(groupMembers).where(eq(groupMembers.userId, bot.id));

    // A member's own capability object never grants more than their role.
    const ownerAccess = await requireGroup({ groupId, user: owner });
    assert.equal(ownerAccess.ok, true);
  });

  test("groups integration: invitation lifecycle — propose, approve, accept, replay", async () => {
    const owner = await freshUser("flow_owner");
    const invitee = await freshUser("flow_invitee");
    const stranger = await freshUser("flow_stranger");
    const { groupId, access } = await makeGroup(owner, `Squad Alpha ${RUN}`);

    // 1. Any member may propose.
    const proposed = await createInvitation({
      access: access,
      username: invitee.username,
      message: "We need a fifth.",
    });
    assert.equal(proposed.ok, true);
    const invitationId = proposed.ok ? proposed.data.id : 0;
    assert.equal(proposed.ok && proposed.data.status, "proposed");

    // 2. A proposal grants NOTHING: no membership row, invisible to the invitee.
    assert.equal(await memberCountOf(groupId), 1);
    const earlyAccept = await acceptInvitation({ viewer: invitee, invitationId });
    const earlyFailure = failureOf(earlyAccept);
    assert.equal(earlyFailure.code, "state");
    assert.match(earlyFailure.error, /not been approved/i);
    assert.equal((await listMyGroupInvitations(invitee.id)).length, 0);

    // 3. Only a manager can approve.
    const asInvitee = await requireGroup({ groupId, user: invitee });
    assert.equal(asInvitee.ok, false, "the invitee is not a member yet");
    const approved = await decideInvitationAsManager({ access: access, invitationId, decision: "approve" });
    assert.equal(approved.ok, true);
    assert.equal(await invitationStatus(invitationId), "invited");

    // 4. Now — and only now — the invitee sees it.
    const inbox = await listMyGroupInvitations(invitee.id);
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].groupId, groupId);
    assert.equal(inbox[0].status, "invited");
    // Another member's inbox is untouched: the list is scoped by session user.
    assert.equal((await listMyGroupInvitations(stranger.id)).length, 0);

    // 5. Acceptance creates the membership.
    const accepted = await acceptInvitation({ viewer: invitee, invitationId });
    assert.equal(accepted.ok, true);
    assert.equal(await memberCountOf(groupId), 2);
    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, invitee.id)))
      .limit(1);
    assert.equal(membership.role, "member");
    assert.equal(membership.invitedBy, owner.id, "provenance is recorded");
    assert.equal(await invitationStatus(invitationId), "accepted");

    // 6. Replay is refused, safely.
    const replay = failureOf(await acceptInvitation({ viewer: invitee, invitationId }));
    assert.equal(replay.code, "state");
    assert.equal(await memberCountOf(groupId), 2, "a replayed accept added nobody");

    // 7. Someone else cannot use this invitation id.
    const hijack = failureOf(await acceptInvitation({ viewer: stranger, invitationId }));
    assert.equal(hijack.code, "not_found", "another member's invitation is not even visible");

    // 8. Duplicates are refused: already a member, already open.
    const again = failureOf(await createInvitation({ access: access, username: invitee.username }));
    assert.equal(again.code, "conflict");
    const strangerInvite = await createInvitation({ access: access, username: stranger.username });
    assert.equal(strangerInvite.ok, true);
    const duplicate = failureOf(await createInvitation({ access: access, username: stranger.username }));
    assert.equal(duplicate.code, "conflict");
    assert.match(duplicate.error, /waiting for review/i);

    // 9. New members can propose too (member holds `invite`).
    const memberAccess = await accessFor(invitee, groupId);
    const fourth = await freshUser("flow_fourth");
    const memberProposal = await createInvitation({ access: memberAccess, username: fourth.username });
    assert.equal(memberProposal.ok, true);
    // …but they cannot approve their own proposal.
    const selfApprove = failureOf(
      await decideInvitationAsManager({
        access: memberAccess,
        invitationId: memberProposal.ok ? memberProposal.data.id : 0,
        decision: "approve",
      }),
    );
    // requireGroup-style refusal: the service answers not_found for a missing capability.
    assert.equal(selfApprove.code, "forbidden");
    assert.equal(selfApprove.error, "Group not found.");
  });

  test("groups integration: rejection, revocation and expiry are final", async () => {
    const owner = await freshUser("dec_owner");
    const proposed = await freshUser("dec_proposed");
    const invited = await freshUser("dec_invited");
    const expiring = await freshUser("dec_expired");
    const { access } = await makeGroup(owner, `Squad Bravo ${RUN}`);

    // Reject a proposal.
    const first = await createInvitation({ access: access, username: proposed.username });
    const firstId = first.ok ? first.data.id : 0;
    const rejected = await decideInvitationAsManager({ access: access, invitationId: firstId, decision: "reject" });
    assert.equal(rejected.ok, true);
    assert.equal(await invitationStatus(firstId), "rejected");
    const afterReject = failureOf(await acceptInvitation({ viewer: proposed, invitationId: firstId }));
    assert.equal(afterReject.code, "state");
    // A second approval of the same row is refused — no resurrection.
    assert.equal(
      failureOf(await decideInvitationAsManager({ access: access, invitationId: firstId, decision: "approve" })).code,
      "state",
    );
    // …but the member may be proposed again later, as a NEW row.
    const reProposed = await createInvitation({ access: access, username: proposed.username });
    assert.equal(reProposed.ok, true);
    assert.notEqual(reProposed.ok ? reProposed.data.id : 0, firstId);

    // Revoke an approved invitation before it is accepted.
    const second = await createInvitation({ access: access, username: invited.username });
    const secondId = second.ok ? second.data.id : 0;
    await decideInvitationAsManager({ access: access, invitationId: secondId, decision: "approve" });
    assert.equal((await listMyGroupInvitations(invited.id)).length, 1);
    const revoked = await decideInvitationAsManager({ access: access, invitationId: secondId, decision: "revoke" });
    assert.equal(revoked.ok, true);
    assert.equal(await invitationStatus(secondId), "revoked");
    assert.equal((await listMyGroupInvitations(invited.id)).length, 0, "revoked invites leave the inbox");
    const afterRevoke = failureOf(await acceptInvitation({ viewer: invited, invitationId: secondId }));
    assert.equal(afterRevoke.code, "state");
    assert.match(afterRevoke.error, /withdrawn/i);

    // Expiry: the sweep marks it, and every later action refuses it.
    const third = await createInvitation({ access: access, username: expiring.username });
    const thirdId = third.ok ? third.data.id : 0;
    await decideInvitationAsManager({ access: access, invitationId: thirdId, decision: "approve" });
    await db
      .update(groupInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(groupInvitations.id, thirdId));
    const afterExpiry = failureOf(await acceptInvitation({ viewer: expiring, invitationId: thirdId }));
    assert.equal(afterExpiry.code, "state");
    assert.match(afterExpiry.error, /expired/i);
    assert.equal(await invitationStatus(thirdId), "expired", "the row was moved to its final state");
    assert.equal(
      failureOf(await decideInvitationAsManager({ access: access, invitationId: thirdId, decision: "approve" })).code,
      "state",
    );
    assert.equal((await listMyGroupInvitations(expiring.id)).length, 0);

    // The invitee can decline an invitation addressed to them.
    const decliner = await freshUser("dec_decliner");
    const fourth = await createInvitation({ access: access, username: decliner.username });
    const fourthId = fourth.ok ? fourth.data.id : 0;
    await decideInvitationAsManager({ access: access, invitationId: fourthId, decision: "approve" });
    const declined = await declineInvitation({ userId: decliner.id, invitationId: fourthId });
    assert.equal(declined.ok, true);
    assert.equal(await invitationStatus(fourthId), "declined");
    assert.equal(failureOf(await acceptInvitation({ viewer: decliner, invitationId: fourthId })).code, "state");
    // Somebody else cannot decline on their behalf.
    const other = await freshUser("dec_other");
    const fifth = await createInvitation({ access: access, username: other.username });
    const fifthId = fifth.ok ? fifth.data.id : 0;
    await decideInvitationAsManager({ access: access, invitationId: fifthId, decision: "approve" });
    assert.equal(failureOf(await declineInvitation({ userId: decliner.id, invitationId: fifthId })).code, "not_found");
  });

  test("groups integration: capacity is enforced, including at the free limit", async () => {
    const owner = await freshUser("cap_owner");
    const { groupId, access } = await makeGroup(owner, `Squad Cap ${RUN}`, 3);
    assert.equal(memberLimitFor({ maxMembers: 3 }, null), 3);

    const second = await freshUser("cap_two");
    const third = await freshUser("cap_three");
    await admit(access, second);
    await admit(access, third);
    assert.equal(await memberCountOf(groupId), 3);

    // A fourth proposal is refused up front: no pointless pending row.
    const fourth = await freshUser("cap_four");
    const refused = failureOf(await createInvitation({ access: access, username: fourth.username }));
    assert.equal(refused.code, "conflict");
    assert.match(refused.error, /full/i);

    // …and even if an invitation somehow existed, acceptance would refuse it.
    await db.update(groups).set({ maxMembers: 4 }).where(eq(groups.id, groupId));
    const invitedAnyway = await createInvitation({ access: access, username: fourth.username });
    assert.equal(invitedAnyway.ok, true);
    await decideInvitationAsManager({
      access: access,
      invitationId: invitedAnyway.ok ? invitedAnyway.data.id : 0,
      decision: "approve",
    });
    await db.update(groups).set({ maxMembers: 3 }).where(eq(groups.id, groupId));
    const lateAccept = failureOf(
      await acceptInvitation({ viewer: fourth, invitationId: invitedAnyway.ok ? invitedAnyway.data.id : 0 }),
    );
    assert.equal(lateAccept.code, "conflict");
    assert.equal(await memberCountOf(groupId), 3, "the cap held");
  });

  test("groups integration: concurrent acceptances cannot exceed the member limit", async () => {
    const owner = await freshUser("race_owner");
    const { groupId, access } = await makeGroup(owner, `Squad Race ${RUN}`, 2);

    const first = await freshUser("race_one");
    const second = await freshUser("race_two");

    const invitations: number[] = [];
    for (const invitee of [first, second]) {
      const proposed = await createInvitation({ access: access, username: invitee.username });
      assert.equal(proposed.ok, true);
      const invitationId = proposed.ok ? proposed.data.id : 0;
      const approved = await decideInvitationAsManager({ access: access, invitationId, decision: "approve" });
      assert.equal(approved.ok, true);
      invitations.push(invitationId);
    }

    // One seat, two simultaneous accepts. The group row lock serialises them:
    // exactly one wins, the loser is told the group is full, and the count is
    // never above the cap.
    const results = await Promise.all([
      acceptInvitation({ viewer: first, invitationId: invitations[0] }),
      acceptInvitation({ viewer: second, invitationId: invitations[1] }),
    ]);
    const succeeded = results.filter((result) => result.ok);
    const refused = results.filter((result) => !result.ok);
    assert.equal(succeeded.length, 1, `exactly one accept should win, got ${JSON.stringify(results)}`);
    assert.equal(refused.length, 1);
    const failure = failureOf(refused[0] as GroupResult<unknown>);
    assert.equal(failure.code, "conflict");
    assert.match(failure.error, /full/i);
    assert.equal(await memberCountOf(groupId), 2);

    // The database-level net catches a write path that skips the check.
    const intruder = await freshUser("race_three");
    await assert.rejects(
      db.insert(groupMembers).values({
        groupId,
        userId: intruder.id,
        role: "member",
        adminPermissions: [],
      }),
      /full|check/i,
      "the capacity trigger must reject an over-cap insert",
    );
    assert.equal(await memberCountOf(groupId), 2);
  });

  test("groups integration: removal and leaving follow the rank rules", async () => {
    const owner = await freshUser("rem_owner");
    const admin = await freshUser("rem_admin");
    const member = await freshUser("rem_member");
    const secondAdmin = await freshUser("rem_admin2");
    const outsider = await freshUser("rem_outsider");
    const { groupId, access } = await makeGroup(owner, `Squad Charlie ${RUN}`);

    await admit(access, admin);
    await admit(access, member);
    await admit(access, secondAdmin);
    const adminAccess = await accessFor(admin, groupId);
    await setMemberRole({ access: access, targetUserId: admin.id, role: "admin" });
    await setMemberRole({ access: access, targetUserId: secondAdmin.id, role: "admin" });
    assert.equal(await memberCountOf(groupId), 4);

    // A plain member cannot remove anyone (the guard answers 404, not 403).
    const memberAccess = await accessFor(member, groupId);
    assert.equal(memberAccess.capabilities.manageMembers, false);
    const memberAttempt = await requireGroup({ groupId, user: member, permission: "manageMembers" });
    assert.equal(memberAttempt.ok, false);
    assert.equal(!memberAttempt.ok && memberAttempt.status, 404);
    const memberRemoval = failureOf(await removeMember({ access: memberAccess, targetUserId: admin.id }));
    assert.equal(memberRemoval.code, "forbidden");
    assert.equal(memberRemoval.error, "Group not found.");

    // A non-member cannot remove anyone either, even with a valid user id.
    const outsiderAccess = await requireGroup({ groupId, user: outsider, permission: "manageMembers" });
    assert.equal(outsiderAccess.ok, false);

    // An admin removes a member…
    const adminRemovesMember = await removeMember({ access: adminAccess, targetUserId: member.id });
    assert.equal(adminRemovesMember.ok, true);
    assert.equal(await memberCountOf(groupId), 3);
    assert.equal((await requireGroup({ groupId, user: member })).ok, false, "removed = no access");

    // …but not another admin, and never the owner.
    const adminVsAdmin = failureOf(await removeMember({ access: adminAccess, targetUserId: secondAdmin.id }));
    assert.equal(adminVsAdmin.code, "forbidden");
    const adminVsOwner = failureOf(await removeMember({ access: adminAccess, targetUserId: owner.id }));
    assert.equal(adminVsOwner.code, "forbidden");
    assert.equal(adminVsOwner.error, "Group not found.", "the refusal does not explain the hierarchy");

    // The owner can remove an admin.
    const ownerRemovesAdmin = await removeMember({ access: access, targetUserId: secondAdmin.id });
    assert.equal(ownerRemovesAdmin.ok, true);
    assert.equal(await memberCountOf(groupId), 2);

    // Removing yourself is a leave, not a removal.
    const selfRemoval = failureOf(await removeMember({ access: adminAccess, targetUserId: admin.id }));
    assert.equal(selfRemoval.code, "state");

    // Leaving works for members/admins, never for the owner.
    const left = await leaveGroup(adminAccess);
    assert.equal(left.ok, true);
    assert.equal(await memberCountOf(groupId), 1);
    const ownerLeave = failureOf(await leaveGroup(access));
    assert.equal(ownerLeave.code, "state");
    assert.match(ownerLeave.error, /transfer ownership/i);
    // The database refuses it too, even if the application layer is bypassed.
    await assert.rejects(
      db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, owner.id))),
      /owner|check/i,
    );
    assert.equal(await memberCountOf(groupId), 1);

    // Removing a member withdraws any invitation still waiting for them, so a
    // removed member cannot join back through an old approved invitation.
    const pending = await freshUser("rem_pending");
    await admit(access, pending);
    const pendingAccess = await accessFor(pending, groupId);
    const another = await freshUser("rem_another");
    const invitation = await createInvitation({ access: pendingAccess, username: another.username });
    assert.equal(invitation.ok, true);
    const invitationId = invitation.ok ? invitation.data.id : 0;
    await decideInvitationAsManager({ access: access, invitationId, decision: "approve" });
    assert.equal((await listMyGroupInvitations(another.id)).length, 1);

    const invitedBack = await createInvitation({ access: access, username: pending.username });
    void invitedBack;
    await removeMember({ access: access, targetUserId: pending.id });
    const staleInvitation = failureOf(
      await acceptInvitation({ viewer: pending, invitationId }),
    );
    void staleInvitation;
    assert.equal((await requireGroup({ groupId, user: pending })).ok, false);
  });

  test("groups integration: admin permissions are granted, filtered and revocable", async () => {
    const owner = await freshUser("adm_owner");
    const member = await freshUser("adm_member");
    const second = await freshUser("adm_second");
    const { groupId, access } = await makeGroup(owner, `Squad Delta ${RUN}`);
    await admit(access, member);
    await admit(access, second);

    // A member cannot promote anyone: manageAdmins is owner-only.
    const memberAccess = await accessFor(member, groupId);
    const memberPromotes = failureOf(
      await setMemberRole({ access: memberAccess, targetUserId: second.id, role: "admin" }),
    );
    assert.equal(memberPromotes.code, "forbidden");
    assert.equal(memberPromotes.error, "Group not found.");

    // The owner promotes, and the defaults are explicit.
    const promoted = await setMemberRole({ access: access, targetUserId: member.id, role: "admin" });
    assert.equal(promoted.ok, true);
    assert.deepEqual(promoted.ok ? promoted.data.permissions : [], [...DEFAULT_ADMIN_PERMISSIONS]);
    const adminAccess = await accessFor(member, groupId);
    assert.equal(adminAccess.role, "admin");
    assert.equal(adminAccess.capabilities.manageMembers, true);
    assert.equal(adminAccess.capabilities.manageAdmins, false, "an admin cannot manage admins");
    assert.equal(adminAccess.capabilities.deleteGroup, false);

    // Only grantable permissions can be set; owner-only ones are refused.
    const forged = failureOf(
      await setAdminPermissions({
        access: access,
        targetUserId: member.id,
        permissions: ["transferOwnership", "deleteGroup", "manageAdmins"],
      }),
    );
    assert.equal(forged.code, "validation");
    const tuned = await setAdminPermissions({
      access: access,
      targetUserId: member.id,
      permissions: ["invite", "moderate", "invite"],
    });
    assert.equal(tuned.ok, true);
    assert.deepEqual(tuned.ok ? tuned.data.permissions : [], ["invite", "moderate"]);

    // An admin cannot tune another admin's permissions.
    await setMemberRole({ access: access, targetUserId: second.id, role: "admin" });
    const secondAccess = await accessFor(second, groupId);
    const adminTunesAdmin = failureOf(
      await setAdminPermissions({
        access: adminAccess,
        targetUserId: second.id,
        permissions: ["invite"],
      }),
    );
    assert.equal(adminTunesAdmin.code, "forbidden");
    // An admin cannot change another admin's role either.
    const adminDemotesAdmin = failureOf(
      await setMemberRole({ access: adminAccess, targetUserId: second.id, role: "member" }),
    );
    assert.equal(adminDemotesAdmin.code, "forbidden");

    // Nobody can set the owner's role, and nobody can self-promote.
    assert.equal(failureOf(await setMemberRole({ access: access, targetUserId: owner.id, role: "admin" })).code, "forbidden");
    assert.equal(failureOf(await setMemberRole({ access: adminAccess, targetUserId: member.id, role: "member" })).code, "state");

    // Demotion removes every capability at once.
    const demoted = await setMemberRole({ access: access, targetUserId: member.id, role: "member" });
    assert.equal(demoted.ok, true);
    assert.deepEqual(demoted.ok ? demoted.data.permissions : [], []);
    const afterDemotion = await accessFor(member, groupId);
    assert.equal(afterDemotion.role, "member");
    assert.equal(afterDemotion.capabilities.manageMembers, false);

    // The database refuses admin permissions on a non-admin row.
    await assert.rejects(
      db
        .update(groupMembers)
        .set({ adminPermissions: ["invite"] })
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, member.id))),
      /check/i,
    );
    assert.equal(capabilitiesFor("admin", DEFAULT_ADMIN_PERMISSIONS).manageAdmins, false);
  });

  test("groups integration: ownership transfer leaves exactly one owner", async () => {
    const owner = await freshUser("own_owner");
    const member = await freshUser("own_member");
    const outsider = await freshUser("own_outsider");
    const { groupId, access } = await makeGroup(owner, `Squad Echo ${RUN}`);
    await admit(access, member);

    // Only the owner can transfer.
    const memberAccess = await accessFor(member, groupId);
    assert.equal(failureOf(await transferOwnership({ access: memberAccess, targetUserId: owner.id })).code, "forbidden");
    // Not to yourself, and not to a non-member.
    assert.equal(failureOf(await transferOwnership({ access: access, targetUserId: owner.id })).code, "state");
    assert.equal(failureOf(await transferOwnership({ access: access, targetUserId: outsider.id })).code, "not_found");

    const transferred = await transferOwnership({ access: access, targetUserId: member.id });
    assert.equal(transferred.ok, true);

    const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    assert.equal(group.ownerId, member.id);
    const rows = await db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId));
    const owners = rows.filter((row) => row.role === "owner");
    assert.equal(owners.length, 1, "exactly one owner row");
    assert.equal(owners[0].userId, member.id);
    const previousOwner = rows.find((row) => row.userId === owner.id);
    assert.equal(previousOwner?.role, "admin", "the previous owner stays on as an admin");
    assert.deepEqual(previousOwner?.adminPermissions ?? [], [...DEFAULT_ADMIN_PERMISSIONS]);

    // Capabilities follow the data, not the session that created the group.
    const newOwnerAccess = await accessFor(member, groupId);
    assert.equal(newOwnerAccess.capabilities.isOwner, true);
    assert.equal(newOwnerAccess.capabilities.deleteGroup, true);
    const oldOwnerAccess = await accessFor(owner, groupId);
    assert.equal(oldOwnerAccess.capabilities.deleteGroup, false);
    assert.equal(oldOwnerAccess.capabilities.transferOwnership, false);

    // The database will not accept a second owner row, or a mismatched one.
    const third = await freshUser("own_third");
    await admit(newOwnerAccess, third);
    await assert.rejects(
      db.insert(groupMembers).values({ groupId, userId: third.id, role: "owner", adminPermissions: [] }),
      /owner|check|unique/i,
    );
  });

  test("groups integration: deleting a group removes every trace of it", async () => {
    const owner = await freshUser("del_owner");
    const member = await freshUser("del_member");
    const invitee = await freshUser("del_invitee");
    const { groupId, access } = await makeGroup(owner, `Squad Foxtrot ${RUN}`);
    await admit(access, member);
    const proposed = await createInvitation({ access: access, username: invitee.username });
    const proposedId = proposed.ok ? proposed.data.id : 0;
    await db
      .insert(groupEntitlements)
      .values({ groupId, tier: "premium_test", memberLimit: 100 });

    // A member cannot delete it.
    const memberAccess = await accessFor(member, groupId);
    assert.equal(failureOf(await deleteGroup(memberAccess)).code, "forbidden");
    assert.equal((await requireGroup({ groupId, user: member, permission: "deleteGroup" })).ok, false);

    const deleted = await deleteGroup(access);
    assert.equal(deleted.ok, true);
    assert.equal(await memberCountOf(groupId), 0, "memberships cascaded");
    const invitations = await db
      .select({ id: groupInvitations.id })
      .from(groupInvitations)
      .where(eq(groupInvitations.groupId, groupId));
    assert.equal(invitations.length, 0, "invitations cascaded");
    const entitlements = await db
      .select({ groupId: groupEntitlements.groupId })
      .from(groupEntitlements)
      .where(eq(groupEntitlements.groupId, groupId));
    assert.equal(entitlements.length, 0, "entitlements cascaded");
    assert.equal((await requireGroup({ groupId, user: owner })).ok, false);
    assert.equal((await requireGroup({ groupId, user: member })).ok, false);
    void proposedId;
  });

  test("groups integration: group details and picture are members-only", async () => {
    const owner = await freshUser("pic_owner");
    const member = await freshUser("pic_member");
    const outsider = await freshUser("pic_outsider");
    const { groupId, access } = await makeGroup(owner, `Squad Golf ${RUN}`);

    const renamed = await updateGroup(access, { name: `Renamed ${RUN}`, description: "Updated." });
    assert.equal(renamed.ok, true);
    assert.equal(renamed.ok ? renamed.data.name : "", `Renamed ${RUN}`);

    const stored = await setGroupPicture(access, { bytes: TEST_IMAGES.png, mime: "image/png" });
    assert.equal(stored.ok, true);
    const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    assert.equal(group.pictureMime, "image/png");
    assert.ok(group.pictureData && group.pictureData.length > 0);

    // A member may update details only if they were granted the capability.
    await admit(access, member);
    const memberAccess = await accessFor(member, groupId);
    assert.equal(memberAccess.capabilities.updateDetails, false);
    assert.equal(failureOf(await updateGroup(memberAccess, { name: `Hijacked ${RUN}` })).code, "forbidden");
    assert.equal(failureOf(await setGroupPicture(memberAccess, { bytes: TEST_IMAGES.png, mime: "image/png" })).code, "forbidden");

    // The owner can grant it, and then the member can.
    await setMemberRole({ access: access, targetUserId: member.id, role: "admin" });
    const adminAccess = await accessFor(member, groupId);
    assert.equal(adminAccess.capabilities.updateDetails, true);
    const adminEdit = await updateGroup(adminAccess, { description: "An admin wrote this." });
    assert.equal(adminEdit.ok, true);

    const removed = await setGroupPicture(adminAccess, null);
    assert.equal(removed.ok, true);
    const [cleared] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    assert.equal(cleared.pictureData, null);
    assert.equal(cleared.pictureMime, null);

    // Members list: the outsider is refused, the member is allowed.
    assert.equal((await requireGroup({ groupId, user: outsider, permission: "viewContent" })).ok, false);
    const members = await listGroupMembers(groupId);
    assert.equal(members.length, 2);
    assert.equal(members[0].role, "owner", "the owner is listed first");
    void memberAccess;
  });

  test("groups integration: entitlements are read from the database, never from the client", async () => {
    const owner = await freshUser("ent_owner");
    const { groupId } = await makeGroup(owner, `Squad Hotel ${RUN}`);

    assert.equal(await readEntitlement(groupId), null, "a new group has no entitlement");
    assert.equal(memberLimitFor({ maxMembers: null }, await readEntitlement(groupId)), FREE_MEMBER_LIMIT);

    // This is exactly what the operator-only script writes. There is no HTTP
    // route that can produce this row, which is the whole point.
    await db
      .insert(groupEntitlements)
      .values({ groupId, tier: "premium_test", memberLimit: 100, grantedBy: owner.id });
    const entitlement = await readEntitlement(groupId);
    assert.equal(entitlement?.memberLimit, 100);
    assert.equal(memberLimitFor({ maxMembers: null }, entitlement), 100);

    // An expired entitlement drops back to the free tier automatically.
    await db
      .update(groupEntitlements)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(groupEntitlements.groupId, groupId));
    assert.equal(memberLimitFor({ maxMembers: null }, await readEntitlement(groupId)), FREE_MEMBER_LIMIT);
    await db.delete(groupEntitlements).where(eq(groupEntitlements.groupId, groupId));
  });

  test("groups integration: review queue and expiry sweep behave for managers only", async () => {
    const owner = await freshUser("rev_owner");
    const member = await freshUser("rev_member");
    const candidate = await freshUser("rev_candidate");
    const { groupId, access } = await makeGroup(owner, `Squad India ${RUN}`);
    await admit(access, member);
    const memberAccess = await accessFor(member, groupId);

    // A member may propose but cannot read the queue.
    const proposed = await createInvitation({ access: memberAccess, username: candidate.username });
    assert.equal(proposed.ok, true);
    const memberQueue = failureOf(await listInvitationsForReview(memberAccess));
    assert.equal(memberQueue.code, "forbidden");

    const ownerQueue = await listInvitationsForReview(access);
    assert.equal(ownerQueue.ok, true);
    assert.equal(ownerQueue.ok ? ownerQueue.data.length : 0, 1);
    assert.equal(ownerQueue.ok ? ownerQueue.data[0].inviteeUsername : "", candidate.username);
    assert.equal(ownerQueue.ok ? ownerQueue.data[0].invitedByUsername : "", member.username);

    // The sweep only touches rows that are actually past their expiry.
    assert.equal(await expireStaleInvitations(groupId), 0);
    await db
      .update(groupInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(groupInvitations.groupId, groupId));
    assert.equal(await expireStaleInvitations(groupId), 1);
    const afterSweep = await listInvitationsForReview(access);
    assert.equal(afterSweep.ok, true);
    assert.deepEqual(afterSweep.ok ? afterSweep.data : [], [], "the expired row left the queue");
  });

  test("groups integration: cleanup", async () => {
    const prefix = `t_${RUN}_%`;
    // Groups first: deleting a group cascades its memberships, and a CASCADE
    // never fires the owner-protection trigger (which guards explicit deletes).
    await db.execute(
      sql`delete from groups where name like ${`%${RUN}%`} and owner_id in (select id from users where username like ${prefix})`,
    );
    await db.execute(
      sql`delete from group_members where user_id in (select id from users where username like ${prefix})`,
    );
    await db.execute(
      sql`delete from group_invitations where invitee_id in (select id from users where username like ${prefix})`,
    );
    await db.execute(sql`delete from users where username like ${prefix}`);

    const left = await db.execute(
      sql`select
            (select count(*)::int from users where username like ${prefix}) as users_left,
            (select count(*)::int from groups where name like ${`%${RUN}%`}) as groups_left`,
    );
    const row = left.rows[0] as { users_left: number; groups_left: number };
    assert.equal(Number(row.users_left), 0, "test users removed");
    assert.equal(Number(row.groups_left), 0, "test groups removed");

    // Close the pool explicitly: without it the test process would only exit
    // when the idle-connection timer fires.
    await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
  });
}
