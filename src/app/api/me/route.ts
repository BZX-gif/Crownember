import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { countUnread } from "@/lib/notifications";
import { countPendingRequests } from "@/lib/social";
import { serializeUser } from "@/lib/utils";

/**
 * Armored: the navbar polls this constantly, so it must NEVER 500.
 * If the pending-count lookup hiccups, we degrade to zero instead of
 * crashing the badges.
 */
export async function GET() {
  const user = await getSessionUser();
  if (user) {
    let pending = 0;
    let unreadNotifications = 0;
    try {
      const [, p, n] = await Promise.all([
        db
          .update(users)
          .set({ lastSeenAt: new Date() })
          .where(eq(users.id, user.id)),
        countPendingRequests(user.id),
        countUnread(user.id),
      ]);
      pending = p;
      unreadNotifications = n;
    } catch {
      pending = 0; // badges stay quiet; next poll retries
      unreadNotifications = 0;
    }
    return NextResponse.json({
      user: serializeUser(user),
      pendingRequests: pending,
      unreadNotifications,
    });
  }
  return NextResponse.json({ user: null, pendingRequests: 0, unreadNotifications: 0 });
}
