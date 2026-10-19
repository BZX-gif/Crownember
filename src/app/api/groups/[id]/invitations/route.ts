import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { USERNAME_RE } from "@/lib/lookup";
import { GROUP_NOT_FOUND_MESSAGE, requireGroup } from "@/lib/groups/access";
import { MAX_INVITATION_MESSAGE } from "@/lib/groups/invitations";
import {
  createInvitation,
  decideInvitationAsManager,
  listInvitationsForReview,
} from "@/lib/groups/service";
import type { InvitationDecision } from "@/lib/groups/invitations";
import {
  UNAUTHORIZED,
  groupResponse,
  groupWriteGate,
  readGroupId,
  readJsonBody, sameOriginGuard,} from "@/lib/groups/http";

const DECISIONS: readonly InvitationDecision[] = ["approve", "reject", "revoke"];

const NOT_FOUND = NextResponse.json({ error: GROUP_NOT_FOUND_MESSAGE }, { status: 404 });

/**
 * POST — propose an invitation. Any active member with `invite` may do this;
 * the row lands as `proposed`, which grants the invitee nothing at all until a
 * manager approves it.
 *
 * GET — the review queue, for owners/admins with `reviewInvitations` only.
 * A plain member cannot see who else has been proposed (that would disclose
 * activity they were not entrusted with); they see their own proposals in the
 * group overview.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = sameOriginGuard(req);
  if (blocked) return blocked;

  const groupId = await readGroupId(context.params);
  if (groupId === null) return NOT_FOUND;

  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED;

  const rl = checkRateLimit(`groups-invite:${user.id}`, 20, 60 * 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "invitations");

  const body = await readJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const username = String(body.username ?? "").trim();
  const message = String(body.message ?? "").trim().slice(0, MAX_INVITATION_MESSAGE);
  if (!username) {
    return NextResponse.json({ error: "Enter a username to invite." }, { status: 400 });
  }
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "That does not look like a VYRON username." },
      { status: 400 },
    );
  }

  const guarded = await requireGroup({ groupId, user, permission: "invite" });
  if (!guarded.ok) {
    return NextResponse.json({ error: guarded.error }, { status: guarded.status });
  }

  const gate = await groupWriteGate(user, message);
  if (!gate.ok) return gate.response;

  const result = await createInvitation({ access: guarded.access, username, message });
  return groupResponse(result, (invitation) =>
    NextResponse.json({ invitation }, { status: 201 }),
  );
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const groupId = await readGroupId(context.params);
  if (groupId === null) return NOT_FOUND;

  const guarded = await requireGroup({ groupId, permission: "reviewInvitations" });
  if (!guarded.ok) {
    return NextResponse.json({ error: guarded.error }, { status: guarded.status });
  }

  const result = await listInvitationsForReview(guarded.access);
  return groupResponse(result, (invitations) => NextResponse.json({ invitations }));
}

/** Approve / reject / revoke one invitation. Managers only. */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = sameOriginGuard(req);
  if (blocked) return blocked;

  const groupId = await readGroupId(context.params);
  if (groupId === null) return NOT_FOUND;

  const body = await readJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const invitationId = Number(body.invitationId);
  const decision = String(body.decision ?? "");
  if (!Number.isInteger(invitationId) || invitationId <= 0) {
    return NextResponse.json({ error: "Unknown invitation." }, { status: 404 });
  }
  if (!(DECISIONS as readonly string[]).includes(decision)) {
    return NextResponse.json(
      { error: "Decision must be approve, reject or revoke." },
      { status: 400 },
    );
  }

  const guarded = await requireGroup({ groupId, permission: "reviewInvitations" });
  if (!guarded.ok) {
    return NextResponse.json({ error: guarded.error }, { status: guarded.status });
  }

  const result = await decideInvitationAsManager({
    access: guarded.access,
    invitationId,
    decision: decision as InvitationDecision,
  });
  return groupResponse(result, (data) => NextResponse.json(data));
}
