import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getNotifications,
  markAllNotificationsRead,
} from "@/lib/notifications";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to view notifications." }, { status: 401 });
  }

  const feed = await getNotifications(user.id);
  return NextResponse.json(
    { items: feed.items, unreadCount: feed.unreadCount, readAt: feed.readAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const limit = checkRateLimit(`notifications-read:${user.id}`, 30, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryInMs, "notifications");

  const readAt = await markAllNotificationsRead(user.id);
  return NextResponse.json({ ok: true, readAt });
}
