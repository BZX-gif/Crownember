import Link from "next/link";
import { asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { messages, rooms, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { messageCutoff } from "@/lib/retention";
import { getHiddenUserIds } from "@/lib/social";
import { getVaultUser } from "@/lib/vault";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Chat" };

/**
 * The messaging home — a full-screen app screen of its own: brand bar,
 * live room list with previews, no site chrome. Tap a room → full-screen
 * thread.
 */
/** Active speakers per room in the last 3 minutes (fresh per request). */
async function recentRoomActivity() {
  return db
    .select({
      roomId: messages.roomId,
      n: sql<number>`count(distinct ${messages.userId})::int`,
    })
    .from(messages)
    .where(gte(messages.createdAt, new Date(Date.now() - 3 * 60_000)))
    .groupBy(messages.roomId);
}

/** Users seen in the last minute (fresh per request). */
async function recentOnlineCount() {
  return db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(gte(users.lastSeenAt, new Date(Date.now() - 60_000)));
}

export default async function ChatHomePage() {
  const [user, allRooms, roomActivity, globalOnline, latestRaw, vaultUser] =
    await Promise.all([
      getSessionUser(),
      db.select().from(rooms).orderBy(asc(rooms.id)),
      recentRoomActivity(),
      recentOnlineCount(),
      db
        .select({ message: messages, author: users })
        .from(messages)
        .innerJoin(users, eq(messages.userId, users.id))
        .where(gte(messages.createdAt, messageCutoff()))
        .orderBy(desc(messages.id))
        .limit(60),
      getVaultUser(),
    ]);

  const onlineByRoom = new Map(
    roomActivity.map((r) => [r.roomId, Number(r.n)]),
  );

  const hidden = user ? await getHiddenUserIds(user.id) : new Set<number>();
  const vaultRoomIds = new Set(
    allRooms.filter((r) => r.isVault).map((r) => r.id),
  );
  const latestByRoom = new Map<
    number,
    { content: string; username: string; createdAt: Date }
  >();
  for (const row of latestRaw) {
    if (hidden.has(row.author.id)) continue; // blocked users leave no trace
    if (vaultRoomIds.has(row.message.roomId)) continue; // vault stays silent
    if (!latestByRoom.has(row.message.roomId)) {
      latestByRoom.set(row.message.roomId, {
        content: row.message.content,
        username: row.author.username,
        createdAt: row.message.createdAt,
      });
    }
  }

  return (
    <div className="bg-grid-subtle nice-scroll relative h-full overflow-y-auto">
      {/* ambient subtle glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, rgba(255,255,255,0.02), transparent 70%)",
        }}
      />

      <div className="relative mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 pb-8">
        {/* app brand bar */}
        <div
          className="flex items-center justify-between py-3"
          style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
        >
          <Link href="/" className="group flex items-center gap-2" aria-label="VYRON Home">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true" className="transition-transform duration-300 group-hover:scale-110">
              <rect width="32" height="32" rx="6" fill="currentColor"/>
              <path d="M8 12h16M8 16h12M8 20h8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
              <circle cx="26" cy="6" r="4" fill="#fff" opacity="0.15"/>
            </svg>
            <span className="font-display text-base uppercase tracking-wide">VYRON</span>
          </Link>
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/60">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40" />
            {Number(globalOnline[0]?.n ?? 0)} online
          </span>
        </div>

        {/* title */}
        <div className="mt-4">
          <p className="font-hud text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">
            {"// chat"}
          </p>
          <h1 className="mt-1 font-display text-4xl uppercase tracking-wide text-white">
            Messages
          </h1>
        </div>

        {!user && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
            <span>💬</span>
            <p className="flex-1">
              You can read the rooms —{" "}
              <Link
                href="/login"
                className="font-bold text-white hover:underline"
              >
                log in
              </Link>{" "}
              to talk.
            </p>
          </div>
        )}

        {/* room list */}
        <div className="mt-5 flex-1 space-y-2.5">
          {allRooms.map((room) => {
            const online = onlineByRoom.get(room.id) ?? 0;
            const locked = room.isVault && !vaultUser;
            const latest = latestByRoom.get(room.id);
            return (
              <Link
                key={room.slug}
                href={`/chat/${room.slug}`}
                className="group flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition duration-200 hover:translate-x-1 hover:border-white/20 hover:bg-white/10 sm:gap-4"
              >
                <span
                  className="vyron-tag flex h-12 w-12 shrink-0 items-center justify-center text-2xl transition-transform duration-200 group-hover:-rotate-6 sm:h-14 sm:w-14"
                  style={{ backgroundColor: `${room.color}1f` }}
                >
                  {room.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-display text-base uppercase tracking-wide text-white group-hover:text-white">
                      {room.name}
                    </span>
                    {locked && (
                      <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 font-hud text-[9px] font-bold uppercase tracking-wider text-white/70">
                        🔒 sealed
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-white/50">
                    {room.isVault ? (
                      "🔒 what happens in the vault stays in the vault"
                    ) : locked ? (
                      "Passcode required — members only"
                    ) : latest ? (
                      <>
                        <span className="font-semibold text-white/70">
                          {latest.username}:
                        </span>{" "}
                        {latest.content}
                      </>
                    ) : (
                      room.description
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  {online > 0 ? (
                    <span className="flex items-center gap-1.5 font-hud text-[10px] font-bold text-white/60">
                      <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                      {online} here
                    </span>
                  ) : (
                    <span className="font-hud text-[10px] font-bold text-white/30">
                      quiet
                    </span>
                  )}
                  {latest && (
                    <span className="font-hud text-[10px] text-white/30">
                      {timeAgo(latest.createdAt)}
                    </span>
                  )}
                  <span className="text-lg text-white/30 transition group-hover:translate-x-0.5 group-hover:text-white/70">
                    ›
                  </span>
                </span>
              </Link>
            );
          })}
        </div>

        {/* footer note */}
        <p className="mt-6 text-center font-hud text-[10px] uppercase tracking-wider text-white/30">
          ⏳ public rooms burn after 3h · 🔐 vault burns after 14 min
        </p>
      </div>
    </div>
  );
}
