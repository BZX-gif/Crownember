import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
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
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }
  const result = await respondFriendRequest(user.id, target.id, false);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true, message: "Request declined." });
}
