import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  groupEntitlements,
  groupInvitations,
  groupMembers,
  groups,
  users,
} from "@/db/schema";
import type { AuthUser } from "@/lib/auth";
import { containsInjection } from "@/lib/antibot";
import { eqLower } from "@/lib/lookup";
import { getBlockState } from "@/lib/social";
import type { GroupAccess, GroupMemberRow, GroupRow } from "@/lib/groups/access";
import {
  decideInvitation,
  evaluateAcceptance,
  invitationExpiry,
  isExpired,
  isOpenInvitation,
  MAX_INVITATION_MESSAGE,
  type InvitationDecision,
} from "@/lib/groups/invitations";
import {
  entitlementActive,
  isPremiumTier,
  memberLimitFor,
  MAX_GROUP_DESCRIPTION,
  MAX_GROUP_NAME,
  MIN_GROUP_NAME,
  type EntitlementLike,
} from "@/lib/groups/limits";

import { validateGroupInput } from "@/lib/groups/validation";
import {
  DEFAULT_ADMIN_PERMISSIONS,
  capabilitiesFor,
  canManageMember,
  isGroupRole,
  normalizeAdminPermissions,
  outranks,
  type GroupPermission,
  type GroupRole,
} from "@/lib/groups/permissions";

/**
 * Group operations. Every write that can change who is inside a group runs in
 * a transaction that first locks the group row (`SELECT … FOR UPDATE`), so two
 * concurrent acceptances, removals or promotions serialize instead of racing.
 *
 * Error codes are the contract with the routes:
 *   not_found  → 404 with "Group not found." (missing AND unauthorized are the
 *                same answer, so private groups cannot be enumerated)
 *   forbidden  → 404 as well, for the same reason
 *   validation → 400, conflict/state → 409, gone → 410, unavailable → 503
 */

export type GroupErrorCode =
  | "not_found"
  | "forbidden"
  | "validation"
  | "conflict"
  | "state"
  | "gone"
  | "unavailable";

export type GroupResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: GroupErrorCode; error: string; status?: number };

export function groupErrorStatus(code: GroupErrorCode): number {
  switch (code) {
    case "validation":
      return 400;
    case "conflict":
    case "state":
      return 409;
    case "gone":
      return 410;
    case "unavailable":
      return 503;
    default:
      // not_found + forbidden: one indistinguishable 404.
      return 404;
  }
}

function ok<T>(data: T): GroupResult<T> {
  return { ok: true, data };
}

function fail<T>(code: GroupErrorCode, error: string): GroupResult<T> {
  return { ok: false, code, error };
}

/**
 * The privacy-preserving refusal. Never says why, never says whether: the same
 * message answers "no such group", "not your group" and "not your capability".
 */
export const GROUP_NOT_FOUND = { code: "not_found", error: "Group not found." } as const;

/** How many groups one member may own at once (spam brake, not a paywall). */
export const MAX_OWNED_GROUPS = 5;

// Limits and text rules live in dependency-free modules (./limits,
// ./validation) so client forms and unit tests read the same numbers the
// server enforces; re-exported here because routes import them from the service.
export { MAX_GROUP_DESCRIPTION, MAX_GROUP_NAME, MIN_GROUP_NAME };
export { GROUP_NAME_PATTERN, validateGroupInput, type GroupValidation } from "@/lib/groups/validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

export interface GroupSummary {
  id: number;
  name: string;
  description: string;
  role: GroupRole;
  memberCount: number;
  memberLimit: number;
  tier: string;
  hasPicture: boolean;
  pictureVersion: string;
  createdAt: Date;
  capabilities: ReturnType<typeof capabilitiesFor>;
  pendingReviewCount?: number;
  myProposedCount?: number;
}

/** Every group the viewer belongs to, with counts. Private by construction. */
export async function listGroupsForUser(userId: number): Promise<GroupSummary[]> {
  const rows = await db
    .select({
      group: groups,
      membership: groupMembers,
      memberCount: sql<number>`(select count(*)::int from group_members gm2 where gm2.group_id = ${groups.id})`,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, userId))
    .orderBy(desc(groupMembers.joinedAt));

  if (rows.length === 0) return [];

  // Entitlements are read per listed group so the cap shown is the real one
  // (a premium group must not advertise the free limit to its own members).
  const entitlementRows = await db
    .select({
      groupId: groupEntitlements.groupId,
      tier: groupEntitlements.tier,
      memberLimit: groupEntitlements.memberLimit,
      expiresAt: groupEntitlements.expiresAt,
    })
    .from(groupEntitlements)
    .where(inArray(groupEntitlements.groupId, rows.map((row) => row.group.id)));
  const entitlements = new Map(entitlementRows.map((row) => [row.groupId, row]));

  const summaries = rows.map((row) =>
    toGroupSummary(row.group, row.membership, row.memberCount, entitlements.get(row.group.id) ?? null),
  );

  const reviewable = summaries.filter((s) => s.capabilities.reviewInvitations).map((s) => s.id);
  if (reviewable.length > 0) {
    const counts = await db
      .select({
        groupId: groupInvitations.groupId,
        status: groupInvitations.status,
        proposerId: groupInvitations.invitedBy,
        n: sql<number>`count(*)::int`,
      })
      .from(groupInvitations)
      .where(and(inArray(groupInvitations.groupId, reviewable), sql`status in ('proposed','invited')`))
      .groupBy(groupInvitations.groupId, groupInvitations.status, groupInvitations.invitedBy);

    for (const summary of summaries) {
      if (!summary.capabilities.reviewInvitations) continue;
      summary.pendingReviewCount = counts
        .filter((c) => c.groupId === summary.id && c.status === "proposed")
        .reduce((total, c) => total + c.n, 0);
      summary.myProposedCount = counts
        .filter((c) => c.groupId === summary.id && c.proposerId === userId)
        .reduce((total, c) => total + c.n, 0);
    }
  }
  return summaries;
}

function toGroupSummary(
  group: GroupRow,
  membership: GroupMemberRow,
  memberCount: number,
  entitlement: EntitlementLike | null,
): GroupSummary {
  const role = isGroupRole(membership.role) ? membership.role : "member";
  const limit = memberLimitFor(group, entitlement);
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    role,
    memberCount,
    memberLimit: limit,
    tier: entitlementActive(entitlement) && isPremiumTier(entitlement?.tier) ? entitlement!.tier : "free",
    hasPicture: Boolean(group.pictureMime),
    pictureVersion: String(Math.floor(new Date(group.pictureVersion).getTime() / 1000)),
    createdAt: group.createdAt,
    capabilities: capabilitiesFor(role, membership.adminPermissions),
  };
}

export interface GroupMemberDTO {
  userId: number;
  username: string;
  bio: string;
  avatarColor: string;
  avatarMime: string | null;
  role: GroupRole;
  permissions: string[];
  joinedAt: Date;
  invitedBy: number | null;
}

/** Member list — callers must already hold `viewContent` via requireGroup(). */
export async function listGroupMembers(groupId: number): Promise<GroupMemberDTO[]> {
  const rows = await db
    .select({ membership: groupMembers, user: users })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(
      sql`case ${groupMembers.role} when 'owner' then 0 when 'admin' then 1 else 2 end`,
      groupMembers.joinedAt,
    );
  return rows.map(({ membership, user }) => ({
    userId: user.id,
    username: user.username,
    bio: user.bio,
    avatarColor: user.avatarColor,
    avatarMime: user.avatarMime,
    role: isGroupRole(membership.role) ? membership.role : "member",
    permissions: membership.adminPermissions ?? [],
    joinedAt: membership.joinedAt,
    invitedBy: membership.invitedBy,
  }));
}

export interface GroupInvitationDTO {
  id: number;
  groupId: number;
  groupName?: string;
  status: string;
  message: string;
  inviteeId: number;
  inviteeUsername?: string;
  invitedBy: number;
  invitedByUsername?: string;
  reviewedBy: number | null;
  expiresAt: Date;
  createdAt: Date;
  approvedAt: Date | null;
  decidedAt: Date | null;
  hasPicture?: boolean;
}

/**
 * Invitations awaiting a decision, for owners/admins with `reviewInvitations`.
 * Opportunistically expires stale rows first, so no cron job is needed and a
 * manager never approves something that is already dead.
 */
export async function listInvitationsForReview(
  access: GroupAccess,
): Promise<GroupResult<GroupInvitationDTO[]>> {
  if (!access.capabilities.reviewInvitations) return fail(...forbidden());
  await expireStaleInvitations(access.group.id);
  const rows = await db
    .select({
      invitation: groupInvitations,
      invitee: users.username,
      inviter: sql<string | null>`(select username from users where id = ${groupInvitations.invitedBy})`,
    })
    .from(groupInvitations)
    .innerJoin(users, eq(users.id, groupInvitations.inviteeId))
    .where(eq(groupInvitations.groupId, access.group.id))
    .orderBy(desc(groupInvitations.id))
    .limit(100);
  return ok(
    rows
      .filter((row) => isOpenInvitation(row.invitation.status))
      .map((row) => ({
        id: row.invitation.id,
        groupId: row.invitation.groupId,
        status: row.invitation.status,
        message: row.invitation.message,
        inviteeId: row.invitation.inviteeId,
        inviteeUsername: row.invitee,
        invitedBy: row.invitation.invitedBy,
        invitedByUsername: row.inviter ?? undefined,
        reviewedBy: row.invitation.reviewedBy,
        expiresAt: row.invitation.expiresAt,
        createdAt: row.invitation.createdAt,
        approvedAt: row.invitation.approvedAt,
        decidedAt: row.invitation.decidedAt,
      })),
  );
}

/**
 * Invitations addressed to this member. Deliberately the only place a group's
 * name is disclosed to a non-member: they were named in an APPROVED
 * invitation, so the disclosure is intended and scoped to their own inbox.
 *
 * `proposed` rows are filtered out here — a member's proposal is internal to
 * the group until a manager approves it, and the proposed person must not
 * learn about it early. Decided rows are history, not an inbox.
 */
export async function listMyGroupInvitations(userId: number): Promise<GroupInvitationDTO[]> {
  await expireStaleInvitations();
  const rows = await db
    .select({ invitation: groupInvitations, group: groups, inviter: users.username })
    .from(groupInvitations)
    .innerJoin(groups, eq(groups.id, groupInvitations.groupId))
    .innerJoin(users, eq(users.id, groupInvitations.invitedBy))
    .where(and(eq(groupInvitations.inviteeId, userId), eq(groupInvitations.status, "invited")))
    .orderBy(desc(groupInvitations.id))
    .limit(50);
  return rows.map((row) => ({
    id: row.invitation.id,
    groupId: row.group.id,
    groupName: row.group.name,
    hasPicture: Boolean(row.group.pictureMime),
    status: row.invitation.status,
    message: row.invitation.message,
    inviteeId: row.invitation.inviteeId,
    invitedBy: row.invitation.invitedBy,
    invitedByUsername: row.inviter,
    reviewedBy: row.invitation.reviewedBy,
    expiresAt: row.invitation.expiresAt,
    createdAt: row.invitation.createdAt,
    approvedAt: row.invitation.approvedAt,
    decidedAt: row.invitation.decidedAt,
  }));
}

/** Marks expired-but-open invitations as `expired`. Group-scoped or global. */
export async function expireStaleInvitations(groupId?: number): Promise<number> {
  const where = groupId
    ? and(eq(groupInvitations.groupId, groupId), sql`status in ('proposed','invited')`, sql`${groupInvitations.expiresAt} <= now()`)
    : and(sql`status in ('proposed','invited')`, sql`${groupInvitations.expiresAt} <= now()`);
  const updated = await db
    .update(groupInvitations)
    .set({ status: "expired", decidedAt: new Date() })
    .where(where)
    .returning({ id: groupInvitations.id });
  return updated.length;
}

/* ------------------------------------------------------------------ *
 * Group lifecycle
 * ------------------------------------------------------------------ */

export interface CreateGroupInput {
  actor: AuthUser;
  name: string;
  description?: string;
  picture?: { bytes: Buffer; mime: string } | null;
}

/**
 * Create a group. The creator becomes its owner in the SAME transaction, so a
 * group can never exist without an owner membership row (the database trigger
 * `group_members_owner_guard` enforces that too).
 */
export async function createGroup(input: CreateGroupInput): Promise<GroupResult<GroupSummary>> {
  const validation = validateGroupInput({ name: input.name, description: input.description });
  if (!validation.ok) return fail("validation", validation.error!);

  const owned = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(groups)
    .where(eq(groups.ownerId, input.actor.id));
  if ((owned[0]?.n ?? 0) >= MAX_OWNED_GROUPS) {
    return fail(
      "conflict",
      `You already own ${MAX_OWNED_GROUPS} groups. Delete one before creating another.`,
    );
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [group] = await tx
        .insert(groups)
        .values({
          name: validation.name!,
          description: validation.description ?? "",
          ownerId: input.actor.id,
          visibility: "private",
          pictureData: input.picture?.bytes ?? null,
          pictureMime: input.picture?.mime ?? null,
        })
        .returning();
      const [membership] = await tx
        .insert(groupMembers)
        .values({ groupId: group.id, userId: input.actor.id, role: "owner", adminPermissions: [] })
        .returning();
      return { group, membership };
    });
    return ok(toGroupSummary(result.group, result.membership, 1, null));
  } catch (error) {
    return fail("unavailable", describeWriteError(error));
  }
}

export async function updateGroup(
  access: GroupAccess,
  input: { name?: unknown; description?: unknown },
): Promise<GroupResult<GroupSummary>> {
  if (!access.capabilities.updateDetails) return fail(...forbidden());
  const patch: { name?: string; description?: string } = {};
  if (input.name !== undefined || input.description !== undefined) {
    const validation = validateGroupInput({
      name: input.name ?? access.group.name,
      description: input.description ?? access.group.description,
    });
    if (!validation.ok) return fail("validation", validation.error!);
    if (input.name !== undefined) patch.name = validation.name;
    if (input.description !== undefined) patch.description = validation.description;
  }
  if (Object.keys(patch).length === 0) {
    return fail("validation", "Nothing to update.");
  }
  try {
    const [group] = await db
      .update(groups)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(groups.id, access.group.id))
      .returning();
    const count = await countMembers(access.group.id);
    const entitlement = await readEntitlement(access.group.id);
    return ok(toGroupSummary(group, access.membership, count, entitlement));
  } catch (error) {
    return fail("unavailable", describeWriteError(error));
  }
}

/** Group picture bytes are validated by lib/images.ts before they arrive. */
export async function setGroupPicture(
  access: GroupAccess,
  picture: { bytes: Buffer; mime: string } | null,
): Promise<GroupResult<{ ok: true }>> {
  if (!access.capabilities.updateDetails) return fail(...forbidden());
  try {
    await db
      .update(groups)
      .set({
        pictureData: picture?.bytes ?? null,
        pictureMime: picture?.mime ?? null,
        pictureVersion: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(groups.id, access.group.id));
    return ok({ ok: true });
  } catch (error) {
    return fail("unavailable", describeWriteError(error));
  }
}

export async function deleteGroup(access: GroupAccess): Promise<GroupResult<{ id: number }>> {
  if (!access.capabilities.deleteGroup) return fail(...forbidden());
  try {
    const result = await db.transaction(async (tx) => {
      // Lock first: a concurrent acceptance either finishes before this or
      // fails on the deleted group. Cascade removes members, invitations and
      // entitlements — nothing private outlives the group.
      await tx.select({ id: groups.id }).from(groups).where(eq(groups.id, access.group.id)).for("update");
      const deleted = await tx.delete(groups).where(eq(groups.id, access.group.id)).returning({ id: groups.id });
      return deleted;
    });
    if (result.length === 0) return fail(...notFound());
    return ok({ id: result[0].id });
  } catch (error) {
    return fail("unavailable", describeWriteError(error));
  }
}

/* ------------------------------------------------------------------ *
 * Membership
 * ------------------------------------------------------------------ */

/** A member leaving. Owners must transfer ownership or delete the group. */
export async function leaveGroup(access: GroupAccess): Promise<GroupResult<{ ok: true }>> {
  if (access.role === "owner") {
    return fail(
      "state",
      "Owners cannot leave their own group. Transfer ownership or delete the group instead.",
    );
  }
  try {
    await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, access.group.id), eq(groupMembers.userId, access.user.id)));
    return ok({ ok: true });
  } catch (error) {
    return fail("unavailable", describeWriteError(error));
  }
}

export async function removeMember(input: {
  access: GroupAccess;
  targetUserId: number;
}): Promise<GroupResult<{ ok: true; username: string }>> {
  const { access, targetUserId } = input;
  if (!Number.isInteger(targetUserId)) return fail(...notFound());

  const target = await readMember(access.group.id, targetUserId);
  if (!target) return fail(...notFound());

  if (!access.capabilities.manageMembers) return fail(...forbidden());
  if (target.userId === access.user.id) {
    return fail("state", "Use Leave group to remove yourself.");
  }
  if (!canManageMember(access, target)) {
    return fail(...forbidden());
  }

  try {
    const result = await db.transaction(async (tx) => {
      await tx.select({ id: groups.id }).from(groups).where(eq(groups.id, access.group.id)).for("update");
      const deleted = await tx
        .delete(groupMembers)
        .where(and(eq(groupMembers.groupId, access.group.id), eq(groupMembers.userId, targetUserId)))
        .returning({ id: groupMembers.id });
      if (deleted.length === 0) return null;
      // Their pending invitations die with their membership path.
      await tx
        .update(groupInvitations)
        .set({ status: "revoked", decidedAt: new Date(), reviewedBy: access.user.id })
        .where(
          and(
            eq(groupInvitations.groupId, access.group.id),
            eq(groupInvitations.inviteeId, targetUserId),
            sql`status in ('proposed','invited')`,
          ),
        );
      return deleted[0];
    });
    if (!result) return fail(...notFound());
    return ok({ ok: true, username: target.username });
  } catch (error) {
    return fail("unavailable", describeWriteError(error));
  }
}

export async function setMemberRole(input: {
  access: GroupAccess;
  targetUserId: number;
  role: GroupRole;
  permissions?: unknown;
}): Promise<GroupResult<GroupMemberDTO>> {
  const { access, targetUserId, role } = input;
  if (!isGroupRole(role) || role === "owner") {
    return fail("validation", "Use Transfer ownership to change the owner.");
  }
  if (!Number.isInteger(targetUserId)) return fail(...notFound());

  const target = await readMember(access.group.id, targetUserId);
  if (!target) return fail(...notFound());
  if (target.role === "owner") {
    return fail("forbidden", "The owner's role cannot be changed here.");
  }
  if (target.userId === access.user.id) {
    return fail("state", "You cannot change your own role.");
  }

  // Two distinct capabilities:
  //  - manageMembers  → move a plain member up or down (and remove them)
  //  - manageAdmins   → anything that creates, changes or dismisses an ADMIN
  //    (owner-only in practice, and never delegable — see permissions.ts)
  const involvesAdmin = role === "admin" || target.role === "admin" || input.permissions !== undefined;
  if (involvesAdmin ? !access.capabilities.manageAdmins : !access.capabilities.manageMembers) {
    return fail(...forbidden());
  }
  if (!outranks(access.role, target.role)) {
    return fail("forbidden", "You can only manage members below your own role.");
  }

  let permissions: string[] = [];
  if (role === "admin") {
    if (input.permissions !== undefined) {
      const normalized = normalizeAdminPermissions(input.permissions);
      if (!normalized.ok) return fail("validation", normalized.error!);
      permissions = normalized.permissions!;
    } else if (target.role === "admin") {
      permissions = target.permissions;
    } else {
      permissions = [...DEFAULT_ADMIN_PERMISSIONS];
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      await tx.select({ id: groups.id }).from(groups).where(eq(groups.id, access.group.id)).for("update");
      const [updated] = await tx
        .update(groupMembers)
        .set({ role, adminPermissions: permissions })
        .where(and(eq(groupMembers.groupId, access.group.id), eq(groupMembers.userId, targetUserId)))
        .returning();
      return updated ?? null;
    });
    if (!result) return fail(...notFound());
    return ok({ ...target, role, permissions });
  } catch (error) {
    return fail("unavailable", describeWriteError(error));
  }
}

export async function setAdminPermissions(input: {
  access: GroupAccess;
  targetUserId: number;
  permissions: unknown;
}): Promise<GroupResult<GroupMemberDTO>> {
  const { access, targetUserId } = input;
  if (!access.capabilities.manageAdmins) return fail(...forbidden());
  const normalized = normalizeAdminPermissions(input.permissions);
  if (!normalized.ok) return fail("validation", normalized.error!);

  const target = await readMember(access.group.id, targetUserId);
  if (!target) return fail(...notFound());
  if (target.role !== "admin") {
    return fail("state", "Only admins have adjustable permissions.");
  }

  const [updated] = await db
    .update(groupMembers)
    .set({ adminPermissions: normalized.permissions! })
    .where(and(eq(groupMembers.groupId, access.group.id), eq(groupMembers.userId, targetUserId)))
    .returning();
  if (!updated) return fail(...notFound());
  return ok({ ...target, permissions: updated.adminPermissions ?? [] });
}

/** Ownership transfer: one statement changes the roles, so the guard trigger
 *  sees a consistent final state and the group is never ownerless. */
export async function transferOwnership(input: {
  access: GroupAccess;
  targetUserId: number;
}): Promise<GroupResult<{ ok: true; username: string }>> {
  const { access, targetUserId } = input;
  if (!access.capabilities.transferOwnership) return fail(...forbidden());
  if (!Number.isInteger(targetUserId)) return fail(...notFound());
  if (targetUserId === access.user.id) {
    return fail("state", "You already own this group.");
  }
  const target = await readMember(access.group.id, targetUserId);
  if (!target) return fail(...notFound());
  if (target.role === "owner") return fail("state", "They already own this group.");

  try {
    await db.transaction(async (tx) => {
      await tx.select({ id: groups.id }).from(groups).where(eq(groups.id, access.group.id)).for("update");
      await tx
        .update(groups)
        .set({ ownerId: targetUserId, updatedAt: new Date() })
        .where(eq(groups.id, access.group.id));
      // One UPDATE statement flips both roles at once: the owner-guard trigger
      // is statement-level, so it validates the final state and never sees a
      // half-transfer with zero or two owners.
      const defaultAdminPermsSql = sql.raw(
        `ARRAY[${DEFAULT_ADMIN_PERMISSIONS.map((p) => `'${p}'`).join(",")}]::text[]`,
      );
      await tx
        .update(groupMembers)
        .set({
          role: sql`CASE WHEN ${groupMembers.userId} = ${targetUserId} THEN 'owner' ELSE 'admin' END`,
          adminPermissions: sql`CASE WHEN ${groupMembers.userId} = ${targetUserId} THEN '{}'::text[] ELSE ${defaultAdminPermsSql} END`,
        })
        .where(
          and(
            eq(groupMembers.groupId, access.group.id),
            sql`${groupMembers.userId} IN (${targetUserId}, ${access.user.id})`,
          ),
        );
    });
    return ok({ ok: true, username: target.username });
  } catch (error) {
    return fail("unavailable", describeWriteError(error));
  }
}

/* ------------------------------------------------------------------ *
 * Invitations
 * ------------------------------------------------------------------ */

export interface CreateInvitationInput {
  access: GroupAccess;
  username: string;
  message?: string;
}

/**
 * Phase 1: any member with `invite` proposes someone. The row is `proposed` —
 * the invitee sees nothing and gains nothing until a manager approves it.
 */
export async function createInvitation(
  input: CreateInvitationInput,
): Promise<GroupResult<GroupInvitationDTO>> {
  const { access } = input;
  if (!access.capabilities.invite) return fail(...forbidden());

  const username = String(input.username ?? "").trim();
  if (!username) return fail("validation", "Enter a username to invite.");
  const message = String(input.message ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_INVITATION_MESSAGE);
  if (containsInjection(message)) {
    return fail("validation", "Invitation notes cannot contain code or script tags.");
  }

  const [target] = await db
    .select({ id: users.id, username: users.username, isBot: users.isBot, banned: users.banned })
    .from(users)
    .where(eqLower(users.username, username))
    .limit(1);
  if (!target || target.isBot || target.banned) {
    return fail("not_found", "That member cannot be invited.");
  }
  if (target.id === access.user.id) {
    return fail("validation", "You are already in this group.");
  }
  const block = await getBlockState(access.user.id, target.id);
  if (block.any) {
    return fail("state", "That member cannot be invited.");
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [group] = await tx
        .select({ id: groups.id, maxMembers: groups.maxMembers })
        .from(groups)
        .where(eq(groups.id, access.group.id))
        .for("update");
      if (!group) return { error: notFound() } as const;

      const [existingMember] = await tx
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, target.id)))
        .limit(1);
      if (existingMember) {
        return { error: ["conflict", `${target.username} is already a member.`] } as const;
      }

      const existing = await tx
        .select({ id: groupInvitations.id, status: groupInvitations.status, expiresAt: groupInvitations.expiresAt })
        .from(groupInvitations)
        .where(and(eq(groupInvitations.groupId, group.id), eq(groupInvitations.inviteeId, target.id)))
        .orderBy(desc(groupInvitations.id))
        .limit(1);
      const open = existing[0];
      if (open && isOpenInvitation(open.status)) {
        return {
          error: [
            "conflict",
            open.status === "invited"
              ? `${target.username} has already been invited and has not answered yet.`
              : `An invitation for ${target.username} is already waiting for review.`,
          ],
        } as const;
      }

      const countRows = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, group.id));
      const entitlement = await readEntitlementTx(tx, group.id);
      const limit = memberLimitFor(group, entitlement);
      const memberCount = countRows[0]?.n ?? 0;
      if (memberCount >= limit) {
        return { error: ["conflict", `This group is full (${limit} members).`] } as const;
      }

      const [invitation] = await tx
        .insert(groupInvitations)
        .values({
          groupId: group.id,
          inviteeId: target.id,
          invitedBy: access.user.id,
          status: "proposed",
          message,
          expiresAt: invitationExpiry(),
        })
        .returning();
      return { invitation } as const;
    });

    if ("error" in result && result.error) {
      const [code, error] = result.error as [GroupErrorCode, string];
      return fail(code, error);
    }
    const invitation = (result as { invitation: typeof groupInvitations.$inferSelect }).invitation;
    return ok({
      id: invitation.id,
      groupId: invitation.groupId,
      status: invitation.status,
      message: invitation.message,
      inviteeId: invitation.inviteeId,
      inviteeUsername: target.username,
      invitedBy: invitation.invitedBy,
      invitedByUsername: access.user.username,
      reviewedBy: invitation.reviewedBy,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      approvedAt: invitation.approvedAt,
      decidedAt: invitation.decidedAt,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail("conflict", "An invitation for that member is already open.");
    }
    return fail("unavailable", describeWriteError(error));
  }
}

/** Phase 2a: an owner/admin with `reviewInvitations` decides a proposal. */
export async function decideInvitationAsManager(input: {
  access: GroupAccess;
  invitationId: number;
  decision: InvitationDecision;
}): Promise<GroupResult<{ id: number; status: string }>> {
  const { access, invitationId, decision } = input;
  if (!access.capabilities.reviewInvitations) return fail(...forbidden());
  if (!Number.isInteger(invitationId)) return fail(...notFound());

  try {
    const result = await db.transaction(async (tx) => {
      // Lock order is always group → invitation.
      await tx.select({ id: groups.id }).from(groups).where(eq(groups.id, access.group.id)).for("update");
      const [invitation] = await tx
        .select()
        .from(groupInvitations)
        .where(and(eq(groupInvitations.id, invitationId), eq(groupInvitations.groupId, access.group.id)))
        .limit(1)
        .for("update");
      if (!invitation) return { error: notFound() } as const;

      const verdict = decideInvitation({
        status: invitation.status,
        decision,
        expiresAt: invitation.expiresAt,
      });
      if (!verdict.ok) {
        if (verdict.code === "expired" && isOpenInvitation(invitation.status)) {
          await tx
            .update(groupInvitations)
            .set({ status: "expired", decidedAt: new Date() })
            .where(eq(groupInvitations.id, invitation.id));
        }
        return { error: [verdict.code === "not_found" ? "not_found" : "state", verdict.error] } as const;
      }
      if (verdict.already) return { id: invitation.id, status: invitation.status } as const;

      const [updated] = await tx
        .update(groupInvitations)
        .set({
          status: verdict.status,
          reviewedBy: access.user.id,
          approvedAt: verdict.status === "invited" ? new Date() : invitation.approvedAt,
          decidedAt: verdict.status === "invited" ? null : new Date(),
        })
        .where(eq(groupInvitations.id, invitation.id))
        .returning();
      return { id: updated.id, status: updated.status } as const;
    });

    if ("error" in result && result.error) {
      const [code, error] = result.error as [GroupErrorCode, string];
      return fail(code, error);
    }
    return ok(result as { id: number; status: string });
  } catch (error) {
    return fail("unavailable", describeWriteError(error));
  }
}

/** Phase 2b: the invitee declines. Only ever their own invitation. */
export async function declineInvitation(input: {
  userId: number;
  invitationId: number;
}): Promise<GroupResult<{ id: number; status: string }>> {
  const invitationId = Number(input.invitationId);
  if (!Number.isInteger(invitationId)) return fail(...notFound());
  try {
    const result = await db.transaction(async (tx) => {
      const [invitation] = await tx
        .select()
        .from(groupInvitations)
        .where(and(eq(groupInvitations.id, invitationId), eq(groupInvitations.inviteeId, input.userId)))
        .limit(1)
        .for("update");
      if (!invitation) return { error: notFound() } as const;
      if (isExpired(invitation.expiresAt) && isOpenInvitation(invitation.status)) {
        await tx
          .update(groupInvitations)
          .set({ status: "expired", decidedAt: new Date() })
          .where(eq(groupInvitations.id, invitation.id));
        return { error: ["state", "That invitation has expired."] } as const;
      }
      if (invitation.status !== "invited") {
        const verdict = decideInvitation({ status: invitation.status, decision: "revoke", expiresAt: invitation.expiresAt });
        return { error: ["state", verdict.ok ? "That invitation is no longer open." : verdict.error] } as const;
      }
      const [updated] = await tx
        .update(groupInvitations)
        .set({ status: "declined", decidedAt: new Date() })
        .where(eq(groupInvitations.id, invitation.id))
        .returning();
      return { id: updated.id, status: updated.status } as const;
    });
    if ("error" in result && result.error) {
      const [code, error] = result.error as [GroupErrorCode, string];
      return fail(code, error);
    }
    return ok(result as { id: number; status: string });
  } catch (error) {
    return fail("unavailable", describeWriteError(error));
  }
}

/**
 * Phase 3: the invitee accepts, and only here does a membership row appear.
 *
 * Everything is re-checked inside the transaction, under the group row lock:
 * invitation ownership, status (approved — never merely proposed), expiry,
 * revocation, replay, current membership, account eligibility and capacity.
 * Two simultaneous accepts serialize on the lock; the loser sees "full".
 */
export async function acceptInvitation(input: {
  viewer: AuthUser;
  invitationId: number;
}): Promise<GroupResult<{ groupId: number; groupName: string }>> {
  const invitationId = Number(input.invitationId);
  if (!Number.isInteger(invitationId)) return fail(...notFound());

  // Cheap, lock-free pre-check for the friendly error message.
  const [preview] = await db
    .select({
      status: groupInvitations.status,
      inviteeId: groupInvitations.inviteeId,
      expiresAt: groupInvitations.expiresAt,
      groupId: groupInvitations.groupId,
    })
    .from(groupInvitations)
    .where(and(eq(groupInvitations.id, invitationId), eq(groupInvitations.inviteeId, input.viewer.id)))
    .limit(1);
  if (!preview) return fail(...notFound());
  if (input.viewer.banned) return fail("not_found", "This account cannot join a group right now.");

  const preCheck = evaluateAcceptance({
    invitation: preview,
    viewerId: input.viewer.id,
    alreadyMember: await isMember(preview.groupId, input.viewer.id),
  });
  if (!preCheck.ok && preCheck.code !== "group_full" && preCheck.code !== "expired") {
    return fail(preCheck.code === "not_found" ? "not_found" : "state", preCheck.error);
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Lock the group row FIRST so concurrent accepts queue here.
      const [group] = await tx
        .select()
        .from(groups)
        .where(eq(groups.id, preview.groupId))
        .limit(1)
        .for("update");
      if (!group) return { error: notFound() } as const;

      const [invitation] = await tx
        .select()
        .from(groupInvitations)
        .where(and(eq(groupInvitations.id, invitationId), eq(groupInvitations.groupId, group.id)))
        .limit(1)
        .for("update");
      if (!invitation || invitation.inviteeId !== input.viewer.id) {
        return { error: notFound() } as const;
      }

      const countRows = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, group.id));
      const memberCount = countRows[0]?.n ?? 0;
      const entitlement = await readEntitlementTx(tx, group.id);
      const memberLimit = memberLimitFor(group, entitlement);

      const [account] = await tx
        .select({ banned: users.banned, isBot: users.isBot })
        .from(users)
        .where(eq(users.id, input.viewer.id))
        .limit(1);

      const verdict = evaluateAcceptance({
        invitation,
        viewerId: input.viewer.id,
        alreadyMember: await isMemberTx(tx, group.id, input.viewer.id),
        memberCount,
        memberLimit,
        accountEligible: Boolean(account) && !account!.banned && !account!.isBot,
      });
      if (!verdict.ok) {
        const code: GroupErrorCode =
          verdict.code === "not_found" ? "not_found" : verdict.code === "group_full" ? "conflict" : "state";
        // A row that expired while it sat open is moved to its final state so
        // it stops showing up in anyone's list.
        if (verdict.code === "expired" && isOpenInvitation(invitation.status)) {
          await tx
            .update(groupInvitations)
            .set({ status: "expired", decidedAt: new Date() })
            .where(eq(groupInvitations.id, invitation.id));
        }
        return { error: [code, verdict.error] } as const;
      }

      const [membership] = await tx
        .insert(groupMembers)
        .values({
          groupId: group.id,
          userId: input.viewer.id,
          role: "member",
          adminPermissions: [],
          invitedBy: invitation.invitedBy,
        })
        .returning();
      if (!membership) return { error: notFound() } as const;

      await tx
        .update(groupInvitations)
        .set({ status: "accepted", decidedAt: new Date() })
        .where(eq(groupInvitations.id, invitation.id));
      await tx.update(groups).set({ updatedAt: new Date() }).where(eq(groups.id, group.id));

      return { groupId: group.id, groupName: group.name } as const;
    });

    if ("error" in result && result.error) {
      const [code, error] = result.error as [GroupErrorCode, string];
      return fail(code, error);
    }
    return ok(result as { groupId: number; groupName: string });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail("conflict", "You are already a member of this group.");
    }
    if (isCheckViolation(error)) {
      return fail("conflict", "That group is full right now.");
    }
    return fail("unavailable", describeWriteError(error));
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function forbidden(): [GroupErrorCode, string] {
  return ["forbidden", GROUP_NOT_FOUND.error];
}

function notFound(): [GroupErrorCode, string] {
  return ["not_found", GROUP_NOT_FOUND.error];
}

export async function countMembers(groupId: number): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));
  return rows[0]?.n ?? 0;
}

async function isMember(groupId: number, userId: number): Promise<boolean> {
  const rows = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

async function isMemberTx(tx: Tx, groupId: number, userId: number): Promise<boolean> {
  const rows = await tx
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

async function readMember(groupId: number, userId: number): Promise<GroupMemberDTO | null> {
  const rows = await db
    .select({ membership: groupMembers, user: users })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.user.id,
    username: row.user.username,
    bio: row.user.bio,
    avatarColor: row.user.avatarColor,
    avatarMime: row.user.avatarMime,
    role: isGroupRole(row.membership.role) ? row.membership.role : "member",
    permissions: row.membership.adminPermissions ?? [],
    joinedAt: row.membership.joinedAt,
    invitedBy: row.membership.invitedBy,
  };
}

export async function readEntitlement(groupId: number): Promise<EntitlementLike | null> {
  const rows = await db
    .select({ tier: groupEntitlements.tier, memberLimit: groupEntitlements.memberLimit, expiresAt: groupEntitlements.expiresAt })
    .from(groupEntitlements)
    .where(eq(groupEntitlements.groupId, groupId))
    .limit(1);
  return rows[0] ?? null;
}

async function readEntitlementTx(tx: Tx, groupId: number): Promise<EntitlementLike | null> {
  const rows = await tx
    .select({ tier: groupEntitlements.tier, memberLimit: groupEntitlements.memberLimit, expiresAt: groupEntitlements.expiresAt })
    .from(groupEntitlements)
    .where(eq(groupEntitlements.groupId, groupId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Write failures are reported without leaking driver detail to the browser.
 * The two constraint families the app cares about are handled by callers.
 */
function describeWriteError(error: unknown): string {
  if (isUniqueViolation(error)) return "That change conflicts with an existing record.";
  if (isCheckViolation(error)) return "That change is not allowed for this group.";
  return "Groups are unavailable right now. Try again in a moment.";
}

function pgCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth++) {
    if ("code" in current && typeof (current as { code?: unknown }).code === "string" && (current as { code: string }).code) {
      return (current as { code: string }).code;
    }
    current = "cause" in current ? (current as { cause?: unknown }).cause : null;
  }
  return undefined;
}

/** 23505 unique_violation — the "one open invitation / one membership" guards. */
export function isUniqueViolation(error: unknown): boolean {
  return pgCode(error) === "23505";
}

/** 23514 check_violation — role, status and the capacity/owner triggers. */
export function isCheckViolation(error: unknown): boolean {
  return pgCode(error) === "23514";
}
