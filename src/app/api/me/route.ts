import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { serializeUser } from "@/lib/utils";

export async function GET() {
  const user = await getSessionUser();
  if (user) {
    await db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, user.id));
    return NextResponse.json({ user: serializeUser(user) });
  }
  return NextResponse.json({ user: null });
}
