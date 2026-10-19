import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { groupMembers, groups } from "@/db/schema";
import { getSessionUser, type AuthUser } from "@/lib/auth";
import {
  capabilitiesFor,
  isGroupRole,
  type GroupCapabilities,
  type GroupPermission,
  type GroupRole,
} from "@/lib/groups/permissions";

/**
 * `requireGroup()` — the server-side guard every group route and protected
 * group page must go through.
 *
 * Privacy rule that shapes every response here:
 *   A private group does not exist for a non-member. A missing group and a
 *   forbidden group produce the SAME answer (`not_found`, HTTP 404), so
 *   walking group ids reveals nothing — not even which ids are taken.
 *   Only an unauthenticated caller gets a distinct 401, because "log in" is
 *   already public knowledge.
 */

export type GroupRow = typeof groups.$inferSelect;
export type GroupMemberRow = typeof groupMembers.$inferSelect;

export interface GroupAccess {
  group: GroupRow;
  membership: GroupMemberRow;
  role: GroupRole;
  capabilities: GroupCapabilities;
  user: AuthUser;
}

export type GroupDenialCode = "unauthenticated" | "not_found" | "forbidden" | "ineligible";

export type GroupAccessResult =
  | { ok: true; access: GroupAccess }
  | { ok: false; code: GroupDenialCode; status: number; error: string };

/** The one and only refusal copy for "you may not see this group". */
export const GROUP_NOT_FOUND_MESSAGE = "Group not found.";

/**
 * Resolve one group for one actor.
 *
 * - `user` may be passed explicitly (tests, background jobs); when omitted the
 *   session cookie decides.
 * - `permission` is optional: omit it for "must be an active member", pass it
 *   for "must be an active member who holds this capability".
 */
export async function requireGroup(input: {
  groupId: number;
  user?: AuthUser | null;
  permission?: GroupPermission;
}): Promise<GroupAccessResult> {
  const groupId = Number(input.groupId);
  if (!Number.isInteger(groupId) || groupId <= 0) return notFoundResult();

  const user = input.user !== undefined ? input.user : await getSessionUser();
  if (!user) {
    return { ok: false, code: "unauthenticated", status: 401, error: "Log in first." };
  }

  // A banned account keeps no group access. Sessions are destroyed at login
  // time, but a ban applied mid-session must take effect immediately. Demo bot
  // accounts can never hold a session either — defence in depth.
  if (user.banned || user.isBot) return notFoundResult("ineligible");

  const rows = await db
    .select({ group: groups, membership: groupMembers })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, user.id)))
    .limit(1);

  const row = rows[0];
  // Not a member, group deleted, or id never existed — one indistinguishable answer.
  if (!row) return notFoundResult();
  if (!isGroupRole(row.membership.role)) return notFoundResult();

  const capabilities = capabilitiesFor(row.membership.role, row.membership.adminPermissions);
  if (input.permission && !capabilities[input.permission]) {
    return notFoundResult("forbidden");
  }

  return {
    ok: true,
    access: {
      group: row.group,
      membership: row.membership,
      role: row.membership.role,
      capabilities,
      user,
    },
  };
}

function notFoundResult(code: GroupDenialCode = "not_found"): GroupAccessResult {
  return { ok: false, code, status: 404, error: GROUP_NOT_FOUND_MESSAGE };
}

/**
 * Page guard for server-rendered group screens. Anything a non-member must not
 * see ends here: `notFound()` renders VYRON's ordinary 404, so the URL, the
 * group name and even the fact that the id exists never reach the browser.
 * A signed-out visitor gets the same 404 — private groups are not advertised.
 */
export async function requireGroupPage(input: {
  groupId: number;
  permission?: GroupPermission;
}): Promise<GroupAccess> {
  const result = await requireGroup(input);
  if (!result.ok) notFound();
  return result.access;
}
