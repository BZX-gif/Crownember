import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  checkRateLimit,
  tooManyRequests,
} from "@/lib/rate-limit";
import {
  findUserByUsername,
  sendFriendRequest,
} from "@/lib/social";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Log in first." }, { status: 401 });
  }
  const rl = checkRateLimit(`friend-req:${user.id}`, 15, 60 * 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "friend requests");

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

  const result = await sendFriendRequest(user.id, target.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    autoAccepted: result.autoAccepted ?? false,
    message: result.autoAccepted
      ? "🤝 They had already sent you a request — you're squad now!"
      : "⚡ Friend request dispatched.",
  });
}
