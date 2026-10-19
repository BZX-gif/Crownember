import { NextResponse } from "next/server";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { acceptInvitation } from "@/lib/groups/service";
import { UNAUTHORIZED, getSessionUser, sameOriginGuard } from "@/lib/groups/http";

/**
 * Accept an invitation — the ONLY code path that turns an invitation into a
 * membership. Authorization, status, expiry, revocation, replay, current
 * membership, account eligibility and capacity are all re-checked inside one
 * transaction holding the group row lock, so concurrent accepts cannot exceed
 * the member limit.
 *
 * Note the deliberate absence of `requireGroup()`: the caller is not a member
 * yet. Privacy is preserved because the invitation row is looked up by
 * (id, inviteeId) — someone else's invitation id is a plain 404.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ invitationId: string }> },
) {
  const blocked = sameOriginGuard(req);
  if (blocked) return blocked;

  const { invitationId: invitationIdParam } = await context.params;
  const invitationId = Number(invitationIdParam);
  if (!Number.isInteger(invitationId) || invitationId <= 0) {
    return NextResponse.json({ error: "That invitation no longer exists." }, { status: 404 });
  }

  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED;

  const rl = checkRateLimit(`groups-accept:${user.id}`, 30, 60 * 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "invitations");

  const result = await acceptInvitation({ viewer: user, invitationId });
  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "validation"
          ? 400
          : result.code === "unavailable"
            ? 503
            : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({
    ok: true,
    groupId: result.data.groupId,
    groupName: result.data.groupName,
  });
}
