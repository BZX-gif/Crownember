import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { getDmThreads, getHiddenUserIds } from "@/lib/social";
import { serializeUser } from "@/lib/utils";
import { purgeExpiredMessages } from "@/lib/purge";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Log in first." }, { status: 401 });
  }

  await purgeExpiredMessages();

  const [threads, hidden] = await Promise.all([
    getDmThreads(user.id),
    getHiddenUserIds(user.id),
  ]);
  const visible = threads.filter((t) => !hidden.has(t.otherId));
  if (visible.length === 0) {
    return NextResponse.json({ threads: [] });
  }

  const others = await db
    .select()
    .from(users)
    .where(inArray(users.id, visible.map((t) => t.otherId)));
  const byId = new Map(others.map((u) => [u.id, u]));

  const sorted = [...visible].sort(
    (a, b) => b.lastAt.getTime() - a.lastAt.getTime(),
  );

  return NextResponse.json({
    threads: sorted
      .filter((t) => byId.has(t.otherId))
      .map((t) => ({
        other: serializeUser(byId.get(t.otherId)!),
        lastContent: t.lastContent,
        lastAt: t.lastAt,
        lastFromMe: t.lastFromMe,
      })),
  });
}
