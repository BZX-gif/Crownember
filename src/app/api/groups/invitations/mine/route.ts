import { NextResponse } from "next/server";
import { listMyGroupInvitations } from "@/lib/groups/service";
import { UNAUTHORIZED, getSessionUser } from "@/lib/groups/http";

/**
 * The invitee's own inbox. This is the single place where a private group's
 * name is disclosed to a non-member, and only for invitations addressed to
 * them — being named is the disclosure. Nothing is filtered by group id from
 * the client, so one member's list can never contain another member's invite.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED;
  return NextResponse.json({ invitations: await listMyGroupInvitations(user.id) });
}
