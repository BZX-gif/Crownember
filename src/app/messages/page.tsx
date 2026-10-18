import Link from "next/link";
import { and, eq, or } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { friendships, users } from "@/db/schema";
import { DmInbox } from "@/components/dm-inbox";
import { getSessionUser } from "@/lib/auth";
import { purgeExpiredMessages } from "@/lib/purge";
import { getDmThreads, getHiddenUserIds } from "@/lib/social";
import { serializeUser } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="w-full max-w-md bg-zinc-900/80 p-8 text-center">
          <span className="text-5xl">✉️</span>
          <h1 className="mt-4 font-display text-2xl uppercase tracking-wide text-white">
            Private <span className="text-zinc-100 font-bold">lines</span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Requests, your circle and one-to-one messages —
            all sealed from the public rooms. Log in to open yours.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/login"
              className="bg-white/10 px-6 py-3 font-display text-xs uppercase tracking-widest text-white transition hover:bg-white/20"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="bg-zinc-100 px-6 py-3 font-display text-xs uppercase tracking-widest text-zinc-950 transition hover:brightness-110"
            >
              Join free
            </Link>
          </div>
        </div>
      </div>
    );
  }

  await purgeExpiredMessages();

  const [friendRows, threads, hidden] = await Promise.all([
    db
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
      ),
    getDmThreads(user.id),
    getHiddenUserIds(user.id),
  ]);

  const friends = [];
  const incoming = [];
  const outgoing = [];
  for (const r of friendRows) {
    const f = r.friendship;
    const mine = f.requesterId === user.id;
    if (hidden.has(r.other.id)) continue; // sealed players leave no trace
    if (f.status === "accepted") friends.push(serializeUser(r.other));
    else if (mine) outgoing.push(serializeUser(r.other));
    else incoming.push(serializeUser(r.other));
  }

  const visibleThreads = threads.filter((t) => !hidden.has(t.otherId));
  const others =
    visibleThreads.length > 0
      ? await db
          .select()
          .from(users)
          .where(
            or(
              ...visibleThreads.map((t) => eq(users.id, t.otherId)),
            ),
          )
      : [];
  const byId = new Map(others.map((u) => [u.id, u]));

  const threadRows = visibleThreads
    .filter((t) => byId.has(t.otherId))
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
    .map((t) => ({
      other: serializeUser(byId.get(t.otherId)!),
      lastContent: t.lastContent,
      lastAt: t.lastAt.toISOString(),
      lastFromMe: t.lastFromMe,
    }));

  return (
    <DmInbox
      friends={friends}
      incoming={incoming}
      outgoing={outgoing}
      threads={threadRows}
    />
  );
}
