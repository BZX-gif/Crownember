import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { markAllRead } from "@/lib/notifications";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

/** Mark the member's own inbox as read. Ownership comes from the session. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Log in first." }, { status: 401 });
  }

  const rl = checkRateLimit(`notifications-read:${user.id}`, 30, 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "inbox updates");

  await markAllRead(user.id);
  return NextResponse.json({ ok: true, unread: 0 });
}
