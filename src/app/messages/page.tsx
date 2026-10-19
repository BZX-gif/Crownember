import Link from "next/link";
import { and, eq, or } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { friendships, users } from "@/db/schema";
import { DmInbox } from "@/components/dm-inbox";
import { Brand } from "@/components/brand";
import { buttonClass } from "@/components/primitives";
import { ArrowLeftIcon, ChatIcon, LockIcon } from "@/components/icons";
import { getSessionUser } from "@/lib/auth";
import { countPendingRequests, getDmThreads, getHiddenUserIds } from "@/lib/social";
import { serializeUser } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Messages",
  description: "Private conversation between VYRON members.",
};

export default async function MessagesPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-ink">
        <header className="border-b border-line">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3">
            <Brand />
            <Link href="/" className={buttonClass("ghost", "sm", "h-8 px-2.5")}>
              <ArrowLeftIcon size={14} /> Site
            </Link>
          </div>
        </header>
        <div className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="w-full max-w-md rounded-xl border border-line bg-panel p-7 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-line text-muted">
              <LockIcon size={18} />
            </span>
            <h1 className="display-title mt-5 text-2xl text-fg">Private messages</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Person-to-person conversation, separate from the public rooms.
              Sign in to open yours.
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Link href="/login" className={buttonClass("secondary", "md")}>
                Sign in
              </Link>
              <Link href="/register" className={buttonClass("primary", "md")}>
                Join VYRON
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const [friendRows, threads, hidden, pending] = await Promise.all([
    db
      .select({ friendship: friendships, other: users })
      .from(friendships)
      .innerJoin(
        users,
        or(
          and(eq(friendships.requesterId, user.id), eq(friendships.addresseeId, users.id)),
          and(eq(friendships.addresseeId, user.id), eq(friendships.requesterId, users.id)),
        ),
      )
      .where(
        or(eq(friendships.requesterId, user.id), eq(friendships.addresseeId, user.id)),
      )
      .limit(200),
    getDmThreads(user.id),
    getHiddenUserIds(user.id),
    countPendingRequests(user.id),
  ]);

  const friends = [];
  const incoming = [];
  const outgoing = [];
  for (const row of friendRows) {
    if (hidden.has(row.other.id)) continue;
    if (row.friendship.status === "accepted") friends.push(serializeUser(row.other));
    else if (row.friendship.requesterId === user.id) outgoing.push(serializeUser(row.other));
    else incoming.push(serializeUser(row.other));
  }

  const visibleThreads = threads.filter((t) => !hidden.has(t.otherId));
  const others =
    visibleThreads.length > 0
      ? await db
          .select()
          .from(users)
          .where(or(...visibleThreads.map((t) => eq(users.id, t.otherId))))
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
    <div className="flex h-[100dvh] flex-col bg-ink">
      <header
        className="shrink-0 border-b border-line"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
          <Brand />
          <span className="ml-auto flex items-center gap-1.5">
            <Link
              href="/chat"
              aria-label="Rooms"
              className={buttonClass("ghost", "sm", "h-8 px-2.5")}
            >
              <ChatIcon size={14} /> <span className="hidden sm:inline">Rooms</span>
            </Link>
            <Link
              href="/"
              aria-label="Back to the site"
              className={buttonClass("ghost", "sm", "h-8 px-2.5")}
            >
              <ArrowLeftIcon size={14} /> <span className="hidden sm:inline">Site</span>
            </Link>
          </span>
        </div>
      </header>

      <div className="nice-scroll flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 pb-12 pt-6">
          <p className="eyebrow">Messages</p>
          <h1 className="display-title mt-1.5 text-3xl text-fg sm:text-4xl">Private</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
            Direct conversation, invisible to the public rooms and cleared after
            three hours.
          </p>
          <DmInbox
            friends={friends}
            incoming={incoming}
            outgoing={outgoing}
            threads={threadRows}
            pendingCount={pending}
          />
        </div>
      </div>
    </div>
  );
}
