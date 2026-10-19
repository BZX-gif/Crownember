import { NextResponse } from "next/server";
import { GROUP_NOT_FOUND_MESSAGE, requireGroup } from "@/lib/groups/access";
import { leaveGroup } from "@/lib/groups/service";
import { groupResponse, readGroupId, sameOriginGuard } from "@/lib/groups/http";

/**
 * Leave a group. Any active member except the owner — owners transfer
 * ownership or delete the group, so a group is never left ownerless (the
 * database enforces that too).
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = sameOriginGuard(req);
  if (blocked) return blocked;

  const groupId = await readGroupId(context.params);
  if (groupId === null) {
    return NextResponse.json({ error: GROUP_NOT_FOUND_MESSAGE }, { status: 404 });
  }
  const guarded = await requireGroup({ groupId });
  if (!guarded.ok) {
    return NextResponse.json({ error: guarded.error }, { status: guarded.status });
  }
  return groupResponse(await leaveGroup(guarded.access), () => NextResponse.json({ ok: true }));
}
