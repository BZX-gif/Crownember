import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { containsInjection } from "@/lib/antibot";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { requireGroup, GROUP_NOT_FOUND_MESSAGE } from "@/lib/groups/access";
import { describeLimit } from "@/lib/groups/limits";
import {
  countMembers,
  deleteGroup,
  listGroupMembers,
  readEntitlement,
  updateGroup,
  MAX_GROUP_DESCRIPTION,
  MAX_GROUP_NAME,
  MIN_GROUP_NAME,
} from "@/lib/groups/service";
import {
  UNAUTHORIZED,
  groupResponse,
  groupWriteGate,
  readGroupId,
  readJsonBody, sameOriginGuard,} from "@/lib/groups/http";

const NOT_FOUND = NextResponse.json({ error: GROUP_NOT_FOUND_MESSAGE }, { status: 404 });

/** Only the owner's identity is repeated here; the full list has its own route. */
function ownerOf(members: Awaited<ReturnType<typeof listGroupMembers>>) {
  const owner = members.find((m) => m.role === "owner");
  return owner ? { userId: owner.userId, username: owner.username } : null;
}

/**
 * Group details. `requireGroup()` is the only door: a non-member, a logged-out
 * visitor and a caller guessing ids all receive the same 404, so the existence
 * of a private group is never disclosed.
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const groupId = await readGroupId(context.params);
  if (groupId === null) return NOT_FOUND;

  const guarded = await requireGroup({ groupId, permission: "viewContent" });
  if (!guarded.ok) {
    return NextResponse.json({ error: guarded.error }, { status: guarded.status });
  }

  const { access } = guarded;
  const [memberCount, entitlement, members] = await Promise.all([
    countMembers(groupId),
    readEntitlement(groupId),
    listGroupMembers(groupId),
  ]);

  return NextResponse.json({
    group: {
      id: access.group.id,
      name: access.group.name,
      description: access.group.description,
      hasPicture: Boolean(access.group.pictureMime),
      pictureVersion: String(Math.floor(new Date(access.group.pictureVersion).getTime() / 1000)),
      createdAt: access.group.createdAt,
      memberCount,
      memberLimit: describeLimit({
        maxMembers: access.group.maxMembers,
        tier: entitlement?.tier ?? null,
        memberLimit: entitlement?.memberLimit ?? null,
      }),
      owner: ownerOf(members),
    },
    myRole: access.role,
    capabilities: access.capabilities,
  });
}

/** Update name/description. Permission is checked on the server, always. */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = sameOriginGuard(req);
  if (blocked) return blocked;

  const groupId = await readGroupId(context.params);
  if (groupId === null) return NOT_FOUND;

  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED;

  const rl = checkRateLimit(`groups-update:${user.id}`, 30, 60 * 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "group edits");

  const guarded = await requireGroup({ groupId, user, permission: "updateDetails" });
  if (!guarded.ok) {
    return NextResponse.json({ error: guarded.error }, { status: guarded.status });
  }

  const body = await readJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const name = body.name === undefined ? undefined : String(body.name).trim();
  const description =
    body.description === undefined ? undefined : String(body.description).trim();
  if (name === undefined && description === undefined) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  if (name !== undefined && (name.length < MIN_GROUP_NAME || name.length > MAX_GROUP_NAME)) {
    return NextResponse.json(
      { error: `Group name must be ${MIN_GROUP_NAME}–${MAX_GROUP_NAME} characters.` },
      { status: 400 },
    );
  }
  if (description !== undefined && description.length > MAX_GROUP_DESCRIPTION) {
    return NextResponse.json(
      { error: `Description must be under ${MAX_GROUP_DESCRIPTION} characters.` },
      { status: 400 },
    );
  }

  const gate = await groupWriteGate(user, `${name ?? ""} ${description ?? ""}`);
  if (!gate.ok) return gate.response;
  if (containsInjection(name ?? "") || containsInjection(description ?? "")) {
    return NextResponse.json(
      { error: "Group text cannot contain code or script tags." },
      { status: 400 },
    );
  }

  const result = await updateGroup(guarded.access, { name, description });
  return groupResponse(result, (group) => NextResponse.json({ group }));
}

/** Owner-only, permanent. Cascades to members, invitations and entitlements. */
export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = sameOriginGuard(req);
  if (blocked) return blocked;

  const groupId = await readGroupId(context.params);
  if (groupId === null) return NOT_FOUND;

  const guarded = await requireGroup({ groupId, permission: "deleteGroup" });
  if (!guarded.ok) {
    return NextResponse.json({ error: guarded.error }, { status: guarded.status });
  }

  const result = await deleteGroup(guarded.access);
  return groupResponse(result, (data) => NextResponse.json({ ok: true, id: data.id }));
}
