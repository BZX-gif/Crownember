import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { findUserByUsername, respondFriendRequest } from "@/lib/social";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Log in first." }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const target = await findUserByUsername(String(body.username ?? ""));
  if (!target) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }
  const result = await respondFriendRequest(user.id, target.id, true);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  // The original requester learns their request was accepted.
  await createNotification({
    userId: target.id,
    actorId: user.id,
    type: "friend_accept",
  });
  return NextResponse.json({ ok: true, message: "Connected." });
}
