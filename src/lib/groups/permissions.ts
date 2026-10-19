/**
 * VYRON private groups — the single authorization vocabulary.
 *
 * This module is deliberately dependency-free (no database, no Next.js) so the
 * whole policy can be unit-tested and so there is exactly one place where a
 * role is turned into a capability. Every group API route and every protected
 * server-rendered page goes through `requireGroup()` in ./access.ts, which is
 * the only thing that reads these rules with a real membership row.
 *
 * Hiding a button is presentation. Nothing in the UI is authorization.
 */

export const GROUP_ROLES = ["owner", "admin", "member"] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

/** Everything a group policy can grant. Adding a capability is additive. */
export const GROUP_PERMISSIONS = [
  /** Read the group's private details, member list and (Slice B) content. */
  "viewContent",
  /** Edit name/description and the group picture. */
  "updateDetails",
  /** Propose an invitation for someone who is not a member. */
  "invite",
  /** Approve, reject or revoke invitations. */
  "reviewInvitations",
  /** Remove members and change a member's role between member/admin. */
  "manageMembers",
  /** Grant or revoke admin capabilities. Owner-only in practice. */
  "manageAdmins",
  /** Create, edit or cancel events and announcements (Slice B/C). */
  "manageEvents",
  /** Warn, mute, hide content, kick for cause (Slice C tooling). */
  "moderate",
  /** Read the audit trail (Slice C storage). */
  "viewAuditLog",
  /** Change the group's premium entitlement. Owner-only. */
  "manageEntitlements",
  /** Hand the group to another member. Owner-only. */
  "transferOwnership",
  /** Delete the group permanently. Owner-only. */
  "deleteGroup",
] as const;

export type GroupPermission = (typeof GROUP_PERMISSIONS)[number];

export function isGroupRole(value: unknown): value is GroupRole {
  return typeof value === "string" && (GROUP_ROLES as readonly string[]).includes(value);
}

export function isGroupPermission(value: unknown): value is GroupPermission {
  return (
    typeof value === "string" &&
    (GROUP_PERMISSIONS as readonly string[]).includes(value)
  );
}

/** Capabilities an admin can ever hold. Everything else stays with the owner. */
export const ADMIN_GRANTABLE_PERMISSIONS: readonly GroupPermission[] = [
  "updateDetails",
  "invite",
  "reviewInvitations",
  "manageMembers",
  "manageEvents",
  "moderate",
  "viewAuditLog",
];

/** What an admin gets the moment they are promoted, before any tuning. */
export const DEFAULT_ADMIN_PERMISSIONS: readonly GroupPermission[] = [
  "updateDetails",
  "invite",
  "reviewInvitations",
  "manageMembers",
];

/**
 * Capabilities the owner can never delegate. An admin who could grant these
 * could promote themselves past the owner, so they are not even grantable.
 */
export const OWNER_ONLY_PERMISSIONS: readonly GroupPermission[] = [
  "manageAdmins",
  "manageEntitlements",
  "transferOwnership",
  "deleteGroup",
];

/** A plain member: participates, sees the group, may propose invitations. */
export const MEMBER_PERMISSIONS: ReadonlySet<GroupPermission> = new Set<GroupPermission>([
  "viewContent",
  "invite",
]);

const OWNER_PERMISSIONS: ReadonlySet<GroupPermission> = new Set(GROUP_PERMISSIONS);

/**
 * Permissions implied by a role. `granted` is the stored `admin_permissions`
 * column and only ever matters for admins — it is filtered against
 * ADMIN_GRANTABLE_PERMISSIONS so a hand-edited row can never mint an
 * owner-only capability.
 */
export function rolePermissions(
  role: GroupRole,
  granted: readonly string[] = [],
): ReadonlySet<GroupPermission> {
  if (role === "owner") return OWNER_PERMISSIONS;
  if (role === "member") return MEMBER_PERMISSIONS;
  const permissions = new Set<GroupPermission>(["viewContent"]);
  for (const value of granted) {
    if (!isGroupPermission(value)) continue;
    if (!ADMIN_GRANTABLE_PERMISSIONS.includes(value)) continue;
    permissions.add(value);
  }
  return permissions;
}

export function roleHasPermission(
  role: GroupRole,
  permission: GroupPermission,
  granted: readonly string[] = [],
): boolean {
  return rolePermissions(role, granted).has(permission);
}

/** Normalise + validate a list an owner wants to grant to an admin. */
export function normalizeAdminPermissions(input: unknown): {
  ok: boolean;
  permissions?: GroupPermission[];
  rejected?: string[];
  error?: string;
} {
  if (!Array.isArray(input)) {
    return { ok: false, error: "Permissions must be a list." };
  }
  const rejected: string[] = [];
  const permissions = new Set<GroupPermission>();
  for (const raw of input) {
    const value = String(raw ?? "");
    if (!isGroupPermission(value) || !ADMIN_GRANTABLE_PERMISSIONS.includes(value)) {
      rejected.push(value);
      continue;
    }
    permissions.add(value);
  }
  if (rejected.length > 0) {
    return {
      ok: false,
      rejected,
      error: `Not grantable to an admin: ${rejected.join(", ")}.`,
    };
  }
  return { ok: true, permissions: [...permissions] };
}

/**
 * Rank order used for "can this actor touch that member".
 * Higher beats lower; equal ranks cannot act on each other (only the owner
 * sits above everyone, and there is exactly one).
 */
export const ROLE_RANK: Record<GroupRole, number> = { member: 0, admin: 1, owner: 2 };

export function outranks(actor: GroupRole, target: GroupRole): boolean {
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

/**
 * `actor` is the capability object from `capabilitiesFor()`; this is the one
 * place that decides whether a removal is allowed. Equal ranks never act on
 * each other, so an admin cannot remove another admin.
 */
export function canManageMember(
  actor: { role: GroupRole; capabilities: GroupCapabilities },
  target: { role: GroupRole },
): boolean {
  if (actor.role === target.role) return false;
  if (!actor.capabilities.manageMembers) return false;
  return outranks(actor.role, target.role);
}

/** Membership states are explicit — an invitation is never a membership. */
export const GROUP_MEMBER_STATES = ["active", "left", "removed"] as const;
export type GroupMemberState = (typeof GROUP_MEMBER_STATES)[number];

export interface GroupCapabilities {
  viewContent: boolean;
  updateDetails: boolean;
  invite: boolean;
  reviewInvitations: boolean;
  manageMembers: boolean;
  manageAdmins: boolean;
  manageEvents: boolean;
  moderate: boolean;
  viewAuditLog: boolean;
  manageEntitlements: boolean;
  transferOwnership: boolean;
  deleteGroup: boolean;
  /** True for owner/admin — used to decide which management UI is worth fetching. */
  isManager: boolean;
  isOwner: boolean;
}

/**
 * The capability object handed to routes and pages. It is derived once from
 * the membership row, so a route can never invent its own interpretation of
 * "admin".
 */
export function capabilitiesFor(
  role: GroupRole,
  granted: readonly string[] = [],
): GroupCapabilities {
  const permissions = rolePermissions(role, granted);
  return {
    viewContent: permissions.has("viewContent"),
    updateDetails: permissions.has("updateDetails"),
    invite: permissions.has("invite"),
    reviewInvitations: permissions.has("reviewInvitations"),
    manageMembers: permissions.has("manageMembers"),
    manageAdmins: permissions.has("manageAdmins"),
    manageEvents: permissions.has("manageEvents"),
    moderate: permissions.has("moderate"),
    viewAuditLog: permissions.has("viewAuditLog"),
    manageEntitlements: permissions.has("manageEntitlements"),
    transferOwnership: permissions.has("transferOwnership"),
    deleteGroup: permissions.has("deleteGroup"),
    isManager: role === "owner" || role === "admin",
    isOwner: role === "owner",
  };
}

export const NO_CAPABILITIES: GroupCapabilities = {
  viewContent: false,
  updateDetails: false,
  invite: false,
  reviewInvitations: false,
  manageMembers: false,
  manageAdmins: false,
  manageEvents: false,
  moderate: false,
  viewAuditLog: false,
  manageEntitlements: false,
  transferOwnership: false,
  deleteGroup: false,
  isManager: false,
  isOwner: false,
};
