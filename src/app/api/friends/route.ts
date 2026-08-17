import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { friendships, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { serializeUser } from "@/lib/utils";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Log in first." }, { status: 401 });
  }

  const rows = await db
    .select({ friendship: friendships, other: users })
    .from(friendships)
    .innerJoin(
      users,
      or(
        and(
          eq(friendships.requesterId, user.id),
          eq(friendships.addresseeId, users.id),
        ),
        and(
          eq(friendships.addresseeId, user.id),
          eq(friendships.requesterId, users.id),
        ),
      ),
    )
    .where(
      or(
        eq(friendships.requesterId, user.id),
        eq(friendships.addresseeId, user.id),
      ),
    );

  const friends = [];
  const incoming = [];
  const outgoing = [];
  for (const r of rows) {
    const f = r.friendship;
    const isRequester = f.requesterId === user.id;
    if (f.status === "accepted") {
      friends.push(serializeUser(r.other));
    } else if (isRequester) {
      outgoing.push(serializeUser(r.other));
    } else {
      incoming.push(serializeUser(r.other));
    }
  }

  return NextResponse.json({ friends, incoming, outgoing });
}
