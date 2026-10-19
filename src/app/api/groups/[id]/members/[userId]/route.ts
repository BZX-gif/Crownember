import { NextResponse } from "next/server";
import { GROUP_NOT_FOUND_MESSAGE, requireGroup } from "@/lib/groups/access";
import { removeMember } from "@/lib/groups/service";
import { groupResponse, readGroupId, sameOriginGuard } from "@/lib/groups/http";

/**
 * Remove a member. `manageMembers` plus the rank rule in
 * lib/groups/permissions.ts decide this — an admin cannot touch another admin,
 * nobody can touch the owner, and the owner cannot be removed at all.
 */
export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  const blocked = sameOriginGuard(req);
  if (blocked) return blocked;

  const { id, userId: userIdParam } = await context.params;
  const groupId = Number(id);
  const targetUserId = Number(userIdParam);
  if (!Number.isInteger(groupId) || groupId <= 0) {
    return NextResponse.json({ error: GROUP_NOT_FOUND_MESSAGE }, { status: 404 });
  }
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return NextResponse.json({ error: GROUP_NOT_FOUND_MESSAGE }, { status: 404 });
  }

  const guarded = await requireGroup({ groupId, permission: "manageMembers" });
  if (!guarded.ok) {
    return NextResponse.json({ error: guarded.error }, { status: guarded.status });
  }

  const result = await removeMember({ access: guarded.access, targetUserId });
  return groupResponse(result, (data) =>
    NextResponse.json({ ok: true, username: data.username }),
  );
}
