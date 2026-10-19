import Link from "next/link";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { RoomGlyph, buttonClass } from "@/components/primitives";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ClockIcon,
  LockIcon,
  MailIcon,
  UnlockIcon,
} from "@/components/icons";
import { db } from "@/db";
import { messages, rooms, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { messageCutoff } from "@/lib/retention";
import { roomDisplay } from "@/lib/rooms";
import { getHiddenUserIds } from "@/lib/social";
import { getVaultUser } from "@/lib/vault";
import { RelativeTime } from "@/components/relative-time";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chat",
  description: "Ephemeral rooms for the VYRON community. Nothing here is permanent.",
};

/** Recent-activity cutoff, computed outside render. */
function activityCutoff() {
  return new Date(Date.now() - 3 * 60_000);
}

export default async function ChatHomePage() {
  const [user, allRooms, roomActivity, latestRaw, vaultUser] = await Promise.all([
    getSessionUser(),
    db.select().from(rooms).orderBy(asc(rooms.id)),
    db
      .select({
        roomId: messages.roomId,
        n: sql<number>`count(distinct ${messages.userId})::int`,
      })
      .from(messages)
      .where(gte(messages.createdAt, activityCutoff()))
      .groupBy(messages.roomId),
    db
      .select({ message: messages, author: users })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .where(
        and(
          gte(messages.createdAt, messageCutoff()),
          eq(users.isBot, false),
        ),
      )
      .orderBy(desc(messages.id))
      .limit(60),
    getVaultUser(),
  ]);

  const hidden = user ? await getHiddenUserIds(user.id) : new Set<number>();
  const onlineByRoom = new Map(roomActivity.map((r) => [r.roomId, Number(r.n)]));
  const vaultRoomIds = new Set(allRooms.filter((r) => r.isVault).map((r) => r.id));
  const latestByRoom = new Map<
    number,
    { content: string; username: string; createdAt: Date }
  >();
  for (const row of latestRaw) {
    if (hidden.has(row.author.id)) continue;
    if (vaultRoomIds.has(row.message.roomId)) continue;
    if (!latestByRoom.has(row.message.roomId)) {
      latestByRoom.set(row.message.roomId, {
        content: row.message.content,
        username: row.author.username,
        createdAt: row.message.createdAt,
      });
    }
  }

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
              href="/messages"
              aria-label="Messages"
              className={buttonClass("ghost", "sm", "h-8 px-2.5")}
            >
              <MailIcon size={14} /> <span className="hidden sm:inline">Messages</span>
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
        <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-6">
          <p className="eyebrow">Chat</p>
          <h1 className="display-title mt-1.5 text-3xl text-fg sm:text-4xl">Rooms</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
            Live conversation that clears itself. Nothing is indexed, nothing is
            permanent. Keep the things worth keeping in the forum.
          </p>

          {!user && (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3">
              <LockIcon size={15} className="text-subtle" />
              <p className="flex-1 text-xs text-muted">
                You can read every room. Signing in lets you write and react.
              </p>
              <div className="flex gap-1.5">
                <Link href="/login" className={buttonClass("secondary", "sm", "h-8 px-3")}>
                  Sign in
                </Link>
                <Link href="/register" className={buttonClass("primary", "sm", "h-8 px-3")}>
                  Join
                </Link>
              </div>
            </div>
          )}

          <ul className="mt-6 space-y-2">
            {allRooms.map((room) => {
              const display = roomDisplay(room);
              const isVault = room.isVault;
              const locked = isVault && !vaultUser;
              const latest = latestByRoom.get(room.id);
              const here = onlineByRoom.get(room.id) ?? 0;

              return (
                <li key={room.slug}>
                  <Link
                    href={`/chat/${room.slug}`}
                    className="group flex items-start gap-3.5 rounded-xl border border-line bg-panel p-4 transition-colors hover:border-line-strong hover:bg-raised"
                  >
                    <span
                      className={
                        isVault
                          ? "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-white/[0.06] text-fg"
                          : "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-white/[0.03] text-muted transition-colors group-hover:text-fg"
                      }
                    >
                      <RoomGlyph icon={display.icon} size={18} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-fg">{display.name}</span>
                        {isVault && (
                          <span className="inline-flex items-center gap-1 rounded border border-line-strong px-1.5 py-0.5 text-[11px] uppercase tracking-[0.08em] text-subtle">
                            {locked ? <LockIcon size={9} /> : <UnlockIcon size={9} />}
                            {locked ? "Locked" : "Open"}
                          </span>
                        )}
                        {here > 0 && (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] text-muted"
                            title="Members who sent a message in the last 3 minutes"
                          >
                            <span className="h-1 w-1 rounded-full bg-success" />
                            {here} active
                          </span>
                        )}
                      </span>

                      <span className="mt-1 block truncate text-xs text-muted">
                        {isVault
                          ? locked
                            ? "Members-only. Unlock with the community passcode."
                            : "Unlocked for this session. Voice notes burn when you leave."
                          : latest
                            ? `${latest.username}: ${latest.content}`
                            : display.description}
                      </span>

                      <span className="mono-meta mt-2 flex items-center gap-1.5">
                        <ClockIcon size={10} /> {display.retention}
                        {!isVault && latest && (
                          <>
                            <span aria-hidden="true">·</span>
                            <RelativeTime date={latest.createdAt} />
                          </>
                        )}
                      </span>
                    </span>

                    <span className="mt-1 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5">
                      <ArrowRightIcon size={15} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="mt-7 text-center text-[11px] leading-relaxed text-subtle">
            Public rooms clear 3 hours after a message is sent. The Vault clears
            after 14 minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
