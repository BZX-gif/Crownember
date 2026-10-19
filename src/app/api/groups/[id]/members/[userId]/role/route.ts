import { NextResponse } from "next/server";
import { GROUP_NOT_FOUND_MESSAGE, requireGroup } from "@/lib/groups/access";
import { isGroupRole, type GroupRole } from "@/lib/groups/permissions";
import { setAdminPermissions, setMemberRole } from "@/lib/groups/service";
import { groupResponse, readJsonBody, sameOriginGuard } from "@/lib/groups/http";

/**
 * Promote / demote / re-tune an admin.
 *
 * Two capabilities, never inferred from the UI:
 *  - moving a plain member up or down needs `manageMembers`
 *  - anything involving an ADMIN needs `manageAdmins` (owner-only today)
 * `permissions` is validated against the grantable list, so an admin can never
 * be handed transferOwnership, deleteGroup or manageAdmins itself.
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  const blocked = sameOriginGuard(req);
  if (blocked) return blocked;

  const { id, userId: userIdParam } = await context.params;
  const groupId = Number(id);
  const targetUserId = Number(userIdParam);
  if (!Number.isInteger(groupId) || groupId <= 0 || !Number.isInteger(targetUserId) || targetUserId <= 0) {
    return NextResponse.json({ error: GROUP_NOT_FOUND_MESSAGE }, { status: 404 });
  }

  const body = await readJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const guarded = await requireGroup({ groupId });
  if (!guarded.ok) {
    return NextResponse.json({ error: guarded.error }, { status: guarded.status });
  }

  if (body.permissions !== undefined && body.role === undefined) {
    const result = await setAdminPermissions({
      access: guarded.access,
      targetUserId,
      permissions: body.permissions,
    });
    return groupResponse(result, (member) => NextResponse.json({ member }));
  }

  const role = String(body.role ?? "");
  if (!isGroupRole(role) || role === "owner") {
    return NextResponse.json(
      { error: "Role must be 'admin' or 'member'. Ownership moves with Transfer ownership." },
      { status: 400 },
    );
  }

  const result = await setMemberRole({
    access: guarded.access,
    targetUserId,
    role: role as GroupRole,
    permissions: body.permissions,
  });
  return groupResponse(result, (member) => NextResponse.json({ member }));
}
