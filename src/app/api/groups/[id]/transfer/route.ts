import { NextResponse } from "next/server";
import { GROUP_NOT_FOUND_MESSAGE, requireGroup } from "@/lib/groups/access";
import { transferOwnership } from "@/lib/groups/service";
import { groupResponse, readGroupId, readJsonBody, sameOriginGuard } from "@/lib/groups/http";

/** Owner-only. The previous owner stays on as an admin. */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = sameOriginGuard(req);
  if (blocked) return blocked;

  const groupId = await readGroupId(context.params);
  if (groupId === null) {
    return NextResponse.json({ error: GROUP_NOT_FOUND_MESSAGE }, { status: 404 });
  }

  const guarded = await requireGroup({ groupId, permission: "transferOwnership" });
  if (!guarded.ok) {
    return NextResponse.json({ error: guarded.error }, { status: guarded.status });
  }

  const body = await readJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const targetUserId = Number(body.userId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return NextResponse.json({ error: "Choose a member to hand the group to." }, { status: 400 });
  }

  const result = await transferOwnership({ access: guarded.access, targetUserId });
  return groupResponse(result, (data) =>
    NextResponse.json({ ok: true, owner: data.username }),
  );
}
