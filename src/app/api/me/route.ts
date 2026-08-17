import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { countPendingRequests } from "@/lib/social";
import { serializeUser } from "@/lib/utils";

export async function GET() {
  const user = await getSessionUser();
  if (user) {
    const [, pending] = await Promise.all([
      db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id)),
      countPendingRequests(user.id),
    ]);
    return NextResponse.json({
      user: serializeUser(user),
      pendingRequests: pending,
    });
  }
  return NextResponse.json({ user: null, pendingRequests: 0 });
}
