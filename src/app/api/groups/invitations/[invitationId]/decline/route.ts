import { NextResponse } from "next/server";
import { declineInvitation } from "@/lib/groups/service";
import { UNAUTHORIZED, getSessionUser, groupResponse, sameOriginGuard } from "@/lib/groups/http";

/** Decline an invitation. Only the invitee, only their own row. */
export async function POST(
  _req: Request,
  context: { params: Promise<{ invitationId: string }> },
) {
  const blocked = sameOriginGuard(_req);
  if (blocked) return blocked;

  const { invitationId: invitationIdParam } = await context.params;
  const invitationId = Number(invitationIdParam);
  if (!Number.isInteger(invitationId) || invitationId <= 0) {
    return NextResponse.json({ error: "That invitation no longer exists." }, { status: 404 });
  }

  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED;

  const result = await declineInvitation({ userId: user.id, invitationId });
  return groupResponse(result, (data) => NextResponse.json(data));
}
