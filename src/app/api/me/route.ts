import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { countPendingRequests } from "@/lib/social";
import { serializeUser } from "@/lib/utils";

/**
 * Armored: the navbar polls this constantly, so it must NEVER 500.
 * If the pending-count lookup hiccups, we degrade to zero instead of
 * crashing the badge.
 */
export async function GET() {
  const user = await getSessionUser();
  if (user) {
    let pending = 0;
    try {
      const [, p] = await Promise.all([
        db
          .update(users)
          .set({ lastSeenAt: new Date() })
          .where(eq(users.id, user.id)),
        countPendingRequests(user.id),
      ]);
      pending = p;
    } catch {
      pending = 0; // badge stays quiet; next poll retries
    }
    return NextResponse.json({
      user: serializeUser(user),
      pendingRequests: pending,
    });
  }
  return NextResponse.json({ user: null, pendingRequests: 0 });
}
