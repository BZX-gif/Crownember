import Link from "next/link";
import Image from "next/image";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { messages, rooms, topics, users } from "@/db/schema";
import { Avatar, RankBadge } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { FOUNDING_LIMIT, getSeatStats } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { getHiddenUserIds } from "@/lib/social";
import {
  formatTimeLeft,
  messageCutoff,
  msUntilExpiry,
} from "@/lib/retention";
import { serializeUser, type PublicUser } from "@/lib/utils";

export const dynamic = "force-dynamic";

const LOADOUT = [
  {
    n: "01",
    icon: "💬",
    title: "Real Conversations",
    desc: "Feed, forum, and chat — all in one place. Share thoughts, join discussions, build connections.",
  },
  {
    n: "02",
    icon: "⏳",
    title: "Ephemeral Chat",
    desc: "Live rooms where messages burn after 3 hours. Talk freely. What deserves to last, post in the forum.",
  },
  {
    n: "03",
    icon: "📈",
    title: "Reputation That Matters",
    desc: "Earn XP for quality contributions. Climb from Member → Legend on the public leaderboard.",
  },
  {
    n: "04",
    icon: "🤝",
    title: "Find Your People",
    desc: "Discover collaborators, mentors, friends. Drop your interests, find your tribe.",
  },
  {
    n: "05",
    icon: "🛡️",
    title: "Founding Members",
    desc: "Only 10 seats at launch. Founders carry a permanent badge in every post, chat, and leaderboard.",
  },
  {
    n: "06",
    icon: "🔐",
    title: "Guard Protected",
    desc: "Rate limits, bot traps, server-verified actions. Your reputation is earned, not hacked.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Claim your seat",
    desc: "Pick your username, add a bio. 10 seconds, ₹0, and the 🛡️ FOUNDER badge is yours.",
  },
  {
    n: "02",
    title: "Join the conversation",
    desc: "Post, reply, chat. Every quality action earns XP before your words burn in 3h.",
  },
  {
    n: "03",
    title: "Build your reputation",
    desc: "Climb to Legend, own the leaderboard, and go down in VYRON history.",
  },
];

export default async function HomePage() {
  const cutoff = messageCutoff();

  const [statsRows, allRooms, topPlayersRaw, foundingRaw, seats, tickerRaw, lobbyRaw] =
    await Promise.all([
      db.execute(sql`
        select
          (select count(*)::int from users where is_bot = false) as players,
          (select count(*)::int from messages) as messages,
          (select count(*)::int from topics) as topics,
          (select count(*)::int from rooms) as rooms
      `),
      db.select().from(rooms).orderBy(asc(rooms.id)),
      db.select().from(users).orderBy(desc(users.xp)).limit(5),
      db
        .select()
        .from(users)
        .where(eq(users.isBot, false))
        .orderBy(asc(users.id))
        .limit(FOUNDING_LIMIT),
      getSeatStats(),
      // PUBLIC feeds only — Vault whispers never reach the front page.
      db
        .select({
          content: messages.content,
          username: users.username,
          authorId: users.id,
        })
        .from(messages)
        .innerJoin(users, eq(messages.userId, users.id))
        .innerJoin(rooms, eq(messages.roomId, rooms.id))
        .where(and(gte(messages.createdAt, cutoff), eq(rooms.isVault, false)))
        .orderBy(desc(messages.id))
        .limit(14),
      db
        .select({ message: messages, author: users })
        .from(messages)
        .innerJoin(users, eq(messages.userId, users.id))
        .innerJoin(rooms, eq(messages.roomId, rooms.id))
        .where(and(gte(messages.createdAt, cutoff), eq(rooms.isVault, false)))
        .orderBy(desc(messages.id))
        .limit(5),
    ]);

  const stats = statsRows.rows[0] as unknown as {
    players: number;
    messages: number;
    topics: number;
    rooms: number;
  };
  const topPlayers = topPlayersRaw.map((u) => serializeUser(u));
  const founding = foundingRaw.map((u) => serializeUser(u));
  const globalRoom = allRooms[0];

  // The block veil: blocked users leave no trace on the front page.
  const viewer = await getSessionUser();
  const hiddenIds = viewer
    ? await getHiddenUserIds(viewer.id)
    : new Set<number>();
  const ticker = tickerRaw.filter((t) => !hiddenIds.has(t.authorId));
  const lobby = lobbyRaw
    .filter((r) => !hiddenIds.has(r.author.id))
    .filter((r) => !globalRoom || r.message.roomId === globalRoom.id)
    .concat(
      lobbyRaw.filter((r) => globalRoom && r.message.roomId !== globalRoom.id),
    )
    .slice(0, 5)
    .reverse();

  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <div>
      {/* ================= HERO / LOBBY ================= */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-black via-[#111] to-black" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.03)_0%,_transparent_70%)]" />
        </div>

        {/* subtle ambient particles */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              className="vyron-particle"
              style={{
                left: `${(i * 17.3 + 8) % 94}%`,
                width: 1.5 + (i % 2),
                height: 1.5 + (i % 2),
                animationDelay: `${(i * 2.1) % 12}s`,
                animationDuration: `${15 + (i % 5)}s`,
              }}
            />
          ))}
        </div>

        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-16 sm:pt-24 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          {/* Left: the call */}
          <div>
            <div className="vyron-tag inline-flex items-center gap-2 bg-white/5 px-4 py-1.5 font-hud text-[11px] font-bold uppercase tracking-[0.2em] text-white/60 backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40" />
              {seats.open
                ? `Founding access — ${seats.left}/${seats.max} seats left`
                : `Applications closed — ${fmt(seats.waitlistCount)} on waitlist`}
            </div>

            <h1 className="mt-6 font-display text-6xl uppercase leading-[0.95] tracking-tight text-white sm:text-8xl">
              <span className="mask-line">
                <span style={{ animationDelay: "0.05s" }}>Share.</span>
              </span>
              <span className="mask-line">
                <span style={{ animationDelay: "0.18s" }}>Connect.</span>
              </span>
              <span className="mask-line">
                <span className="text-vyron" style={{ animationDelay: "0.31s" }}>
                  Belong.
                </span>
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/60">
              The premium global social platform — open to{" "}
              <span className="font-bold text-white">only 10 founding members</span>{" "}
              . Chat burns every 3 hours ⏳, reputation climbs from Member to
              Legend, and everything is free. Forever.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/register"
                className="vyron-btn bg-white text-black px-8 py-4 font-display text-sm uppercase tracking-widest transition hover:-translate-y-0.5 hover:brightness-110"
              >
                {seats.open ? `Claim seat #${seats.taken + 1} →` : "Join waitlist →"}
              </Link>
              <Link
                href="/forum"
                className="vyron-btn border border-white/10 bg-white/5 px-8 py-4 font-display text-sm uppercase tracking-widest text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/10 hover:border-white/20"
              >
                Explore the forum
              </Link>
            </div>

            {/* Seat HUD */}
            <div className="vyron-corners mt-10 max-w-md bg-black/60 p-4 backdrop-blur">
              <div className="flex items-center justify-between font-hud text-[11px] uppercase tracking-[0.18em]">
                <span className="text-white/40">{"// founding_members"}</span>
                <span className={seats.open ? "text-white" : "text-white/40"}>
                  {seats.open ? `${seats.left} seats open` : "closed"}
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-10 gap-1.5">
                {Array.from({ length: seats.max }, (_, i) => (
                  <span
                    key={i}
                    className={
                      i < seats.taken
                        ? "vyron-tag h-3 bg-gradient-to-r from-white to-white/60"
                        : "vyron-tag h-3 border border-dashed border-white/15 bg-white/5"
                    }
                  />
                ))}
              </div>
              <p className="mt-2.5 font-hud text-[11px] text-white/30">
                {fmt(stats.players)} member{stats.players === 1 ? "" : "s"} in ·{" "}
                {fmt(stats.messages)} messages sent · {fmt(stats.topics)} topics
                created
              </p>
            </div>
          </div>

          {/* Right: live lobby feed */}
          <div className="vyron-corners card-base relative p-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute h-full w-full animate-ping rounded-full bg-white/30 opacity-75" />
                  <span className="relative h-2.5 w-2.5 rounded-full bg-white/60" />
                </span>
                <span className="font-hud text-xs font-bold uppercase tracking-[0.2em] text-white/60">
                  live_feed // global
                </span>
              </div>
              <span className="vyron-tag bg-white/5 px-2.5 py-1 font-hud text-[10px] font-bold text-white/60">
                TTL 3H
              </span>
            </div>
            <div className="mt-4 space-y-4">
              {lobby.length === 0 && (
                <p className="py-6 text-center font-hud text-xs text-white/30">
                  {"// quiet in the lobby… be the first to speak"}
                </p>
              )}
              {lobby.map((r) => (
                <div key={r.message.id} className="flex gap-3">
                  <Avatar
                    name={r.author.username}
                    color={r.author.avatarColor}
                    size={32}
                    dev={r.author.isDev}
                    className="avatar-ring"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-bold text-white">
                        {r.author.username}
                      </span>
                      <span className="font-hud text-[10px] text-white/30">
                        ⏳ {formatTimeLeft(msUntilExpiry(r.message.createdAt))}
                      </span>
                    </div>
                    <p className="truncate text-sm text-white/70">
                      {r.message.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/chat"
              className="mt-5 flex items-center justify-between border-t border-white/10 pt-3 font-hud text-xs font-bold uppercase tracking-[0.18em] text-white/60 transition hover:text-white"
            >
              enter chat
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ================= LIVE TICKER ================= */}
      <div className="marquee-pause relative overflow-hidden border-y border-white/10 bg-black py-3">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-black to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-black to-transparent" />
        <div className="animate-marquee flex w-max items-center gap-10 px-4 font-hud text-xs text-white/30">
          {[...ticker, ...ticker].map((m, i) => (
            <span key={i} className="flex items-center gap-2 whitespace-nowrap">
              <span className="font-bold text-white/50">{m.username}</span>
              <span className="text-white/15">▸</span>
              <span className="max-w-[320px] truncate text-white/60">{m.content}</span>
              <span className="text-white/10">💬</span>
            </span>
          ))}
        </div>
      </div>

      {/* ================= FOUNDING MEMBERS ================= */}
      <section className="relative border-b border-white/10 bg-gradient-to-b from-white/5 via-black to-black">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="mx-auto max-w-7xl px-4 py-20">
          <Reveal>
            <p className="font-hud text-xs font-bold uppercase tracking-[0.3em] text-white/40">
              {"// 10 seats · never reopened"}
            </p>
            <h2 className="mt-3 font-display text-4xl uppercase text-white sm:text-5xl">
              The <span className="text-vyron">Founding Members</span>
            </h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-white/50">
              The first 10 members through the doors shape VYRON forever — and
              carry the 🛡️ <span className="font-bold text-white">FOUNDER</span>{" "}
              badge in every post, chat, and leaderboard. When all 10 seats are
              claimed, the doors close.
            </p>
          </Reveal>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: FOUNDING_LIMIT }, (_, i) => {
              const member = founding[i];
              if (member) {
                return (
                  <Reveal key={member.id} delay={i * 60}>
                    <Link
                      href={`/players/${encodeURIComponent(member.username)}`}
                      className="vyron-corners group block card-base p-4 text-center transition duration-300 hover:-translate-y-1.5 hover:border-white/20"
                    >
                      <p className="vyron-tag inline-block bg-white/5 px-2 py-0.5 font-hud text-[10px] font-bold uppercase tracking-widest text-white/60">
                        seat #{i + 1}
                      </p>
                      <Avatar
                        name={member.username}
                        color={member.avatarColor}
                        size={54}
                        dev={member.dev}
                        className="mx-auto mt-3 transition-transform duration-300 group-hover:scale-110 avatar-ring"
                      />
                      <p className="mt-3 truncate font-display text-sm uppercase tracking-wide text-white">
                        {member.username}
                      </p>
                      <p className="mt-1 font-hud text-[10px] font-bold text-white/50">
                        🛡️ FOUNDER
                      </p>
                    </Link>
                  </Reveal>
                );
              }
              return seats.open ? (
                <Reveal key={`open-${i}`} delay={i * 60}>
                  <Link
                    href="/register"
                    className="group flex h-full flex-col items-center justify-center border-2 border-dashed border-white/10 p-4 text-center transition duration-300 hover:-translate-y-1.5 hover:border-white/40 hover:bg-white/5"
                  >
                    <p className="vyron-tag inline-block bg-white/5 px-2 py-0.5 font-hud text-[10px] font-bold uppercase tracking-widest text-white/40">
                      seat #{i + 1}
                    </p>
                    <span className="mt-3 flex h-[54px] w-[54px] items-center justify-center rounded-full border border-dashed border-white/15 font-display text-xl text-white/30 transition group-hover:border-white/40 group-hover:text-white">
                      ?
                    </span>
                    <p className="mt-3 font-display text-sm uppercase tracking-wide text-white/40 transition group-hover:text-white">
                      Your name here
                    </p>
                    <p className="mt-1 font-hud text-[10px] font-bold text-white/30 transition group-hover:text-white/60">
                      claim it free →
                    </p>
                  </Link>
                </Reveal>
              ) : (
                <div
                  key={`closed-${i}`}
                  className="flex flex-col items-center justify-center border border-white/10 bg-black/50 p-4 text-center opacity-50"
                >
                  <p className="font-hud text-[10px] font-bold uppercase tracking-widest text-white/30">
                    seat #{i + 1}
                  </p>
                  <span className="mt-3 flex h-[54px] w-[54px] items-center justify-center rounded-full border border-white/10 text-xl">
                    🔒
                  </span>
                  <p className="mt-3 font-display text-sm uppercase text-white/30">
                    Claimed
                  </p>
                </div>
              );
            })}
          </div>

          <Reveal className="mt-8 text-center">
            {seats.open ? (
              <p className="font-hud text-sm font-bold text-white/60">
                <span className="text-white">{seats.left} seats remaining.</span>{" "}
                When they&apos;re gone, they&apos;re gone.
              </p>
            ) : (
              <p className="font-hud text-sm font-bold text-white/60">
                All seats claimed.{" "}
                <Link href="/register" className="text-white hover:underline">
                  Join the waitlist →
                </Link>{" "}
                ({fmt(seats.waitlistCount)} in line)
              </p>
            )}
          </Reveal>
        </div>
      </section>

      {/* ================= ROOMS ================= */}
      <section className="bg-grid-subtle relative">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <Reveal>
            <p className="font-hud text-xs font-bold uppercase tracking-[0.3em] text-white/40">
              {"// join the conversation"}
            </p>
            <h2 className="mt-3 font-display text-4xl uppercase text-white sm:text-5xl">
              Jump Into a <span className="text-vyron">Chat Room</span>
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allRooms.map((room, i) => (
              <Reveal key={room.slug} delay={(i % 3) * 80}>
                <Link
                  href={`/chat/${room.slug}`}
                  className="vyron-corners group relative block overflow-hidden card-base p-5 transition duration-300 hover:-translate-y-1.5 hover:border-white/20"
                >
                  <div
                    className="absolute inset-x-0 top-0 h-1 opacity-40 transition-opacity group-hover:opacity-100"
                    style={{ background: room.color }}
                  />
                  <div className="flex items-center justify-between">
                    <span
                      className="vyron-tag flex h-11 w-11 items-center justify-center text-xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
                      style={{ backgroundColor: `${room.color}1a` }}
                    >
                      {room.icon}
                    </span>
                    <span className="flex items-center gap-1.5 font-hud text-[10px] font-bold uppercase tracking-widest text-white/50">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40" />
                      live
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-lg uppercase tracking-wide text-white transition group-hover:text-white">
                    {room.name}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/50">
                    {room.description}
                  </p>
                  <p className="mt-4 font-hud text-xs font-bold uppercase tracking-[0.18em] text-white/40 transition group-hover:text-white/70">
                    enter room →
                  </p>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= LOADOUT / FEATURES ================= */}
      <section className="mx-auto max-w-7xl px-4 py-20">
        <Reveal>
          <p className="font-hud text-xs font-bold uppercase tracking-[0.3em] text-white/40">
            {"// equipped by default"}
          </p>
          <h2 className="mt-3 font-display text-4xl uppercase text-white sm:text-5xl">
            Built For <span className="text-vyron">Connection</span>
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-x-12 md:grid-cols-2">
          {LOADOUT.map((f, i) => (
            <Reveal key={f.n} delay={(i % 2) * 80}>
              <div className="group flex gap-5 border-l border-white/10 py-6 pl-6 transition duration-300 hover:border-white/30 hover:pl-8">
                <span className="font-hud text-sm font-bold text-white/40">
                  {f.n}
                </span>
                <div>
                  <h3 className="flex items-center gap-2.5 font-display text-lg uppercase tracking-wide text-white">
                    <span className="transition-transform duration-300 group-hover:scale-125">
                      {f.icon}
                    </span>
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/50">
                    {f.desc}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ================= LEGENDS ================= */}
      <section className="mx-auto max-w-7xl px-4 pb-20">
        <Reveal>
          <div className="vyron-corners card-base p-6 sm:p-10">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-hud text-xs font-bold uppercase tracking-[0.3em] text-white/40">
                  {"// hall of fame"}
                </p>
                <h2 className="mt-2 font-display text-3xl uppercase text-white sm:text-4xl">
                  This Week&apos;s <span className="text-vyron">Legends</span>
                </h2>
              </div>
              <Link
                href="/players"
                className="vyron-btn border border-white/10 bg-white/5 px-6 py-3 font-hud text-xs font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/10 hover:border-white/20"
              >
                full leaderboard →
              </Link>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {topPlayers.map((p, i) => (
                <Link
                  key={p.id}
                  href={`/players/${encodeURIComponent(p.username)}`}
                  className="group flex items-center gap-3 border border-white/10 bg-black/60 p-4 transition duration-300 hover:-translate-y-1 hover:border-white/20"
                >
                  <span className="font-hud text-lg font-bold text-white/30 transition group-hover:text-white/60">
                    {i + 1}
                  </span>
                  <Avatar name={p.username} color={p.avatarColor} size={40} dev={p.dev} className="avatar-ring" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{p.username}</p>
                    <RankBadge rank={p.rank} size="xs" />
                    <p className="mt-0.5 font-hud text-[10px] text-white/40">
                      ⭐ {fmt(p.xp)} XP
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= MISSION PLAN ================= */}
      <section className="bg-grid-subtle border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <Reveal>
            <h2 className="text-center font-display text-4xl uppercase text-white sm:text-5xl">
              From Newcomer To <span className="text-vyron">Legend</span>
            </h2>
          </Reveal>
          <div className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-6">
            <div className="absolute left-1/2 top-7 hidden h-0.5 w-[66%] -translate-x-1/2 border-t border-dashed border-white/10 md:block" />
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 120} className="relative">
                <div className="text-center">
                  <span className="vyron-tag relative z-10 inline-flex h-14 w-14 items-center justify-center bg-white text-black font-display text-lg">
                    {s.n}
                  </span>
                  <h3 className="mt-4 font-display text-xl uppercase tracking-wide text-white">
                    {s.title}
                  </h3>
                  <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/50">
                    {s.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FINAL CTA ================= */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-black via-[#1a1a1a] to-black" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.02)_0%,_transparent_70%)]" />
        </div>
        <div className="relative mx-auto max-w-3xl px-4 py-28 text-center">
          <span className="animate-floaty inline-block text-5xl">✨</span>
          <h2 className="mt-5 font-display text-4xl uppercase leading-tight text-white sm:text-6xl">
            The doors close at{" "}
            <span className="text-vyron">{seats.max} members</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl leading-relaxed text-white/60">
            {seats.open
              ? `${seats.left} founding seats remain. After that, VYRON goes waitlist-only and everyone else waits in line. Your people are already inside.`
              : `All ${seats.max} founding seats are claimed — but ${fmt(seats.waitlistCount)} people are holding their spot on the waitlist. Get in line before it grows.`}
          </p>
          <Link
            href="/register"
            className="vyron-btn bg-white text-black mt-9 inline-block px-10 py-4 font-display text-base uppercase tracking-widest transition hover:-translate-y-0.5 hover:brightness-110"
          >
            {seats.open ? `Claim seat #${seats.taken + 1} — free forever` : "Join the waitlist"}
          </Link>
          <p className="mt-4 font-hud text-xs text-white/30">
            no payment · no credit card · no ads · just connection ✨
          </p>
        </div>
      </section>
    </div>
  );
}