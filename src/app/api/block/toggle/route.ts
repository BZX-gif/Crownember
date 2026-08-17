import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  checkRateLimit,
  tooManyRequests,
} from "@/lib/rate-limit";
import {
  findUserByUsername,
  sealDirectMessages,
  toggleBlock,
} from "@/lib/social";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Log in first." }, { status: 401 });
  }
  const rl = checkRateLimit(`block:${user.id}`, 30, 60 * 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "block changes");

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

  const result = await toggleBlock(user.id, target.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  if (result.nowBlocked) {
    // Their words vanish from your world — including the DM history.
    await sealDirectMessages(user.id, target.id);
  }
  return NextResponse.json({
    ok: true,
    blocked: result.nowBlocked,
    message: result.nowBlocked
      ? "🚫 Sealed. They've vanished from your screens."
      : "The seal is lifted. They can exist in your world again.",
  });
}
