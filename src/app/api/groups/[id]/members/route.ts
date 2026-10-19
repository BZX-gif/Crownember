import { NextResponse } from "next/server";
import { GROUP_NOT_FOUND_MESSAGE, requireGroup } from "@/lib/groups/access";
import { listGroupMembers } from "@/lib/groups/service";
import { readGroupId } from "@/lib/groups/http";

/** The member list is private content: members only, one shared guard. */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const groupId = await readGroupId(context.params);
  if (groupId === null) {
    return NextResponse.json({ error: GROUP_NOT_FOUND_MESSAGE }, { status: 404 });
  }
  const guarded = await requireGroup({ groupId, permission: "viewContent" });
  if (!guarded.ok) {
    return NextResponse.json({ error: guarded.error }, { status: guarded.status });
  }
  return NextResponse.json({ members: await listGroupMembers(groupId) });
}
