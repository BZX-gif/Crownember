import Image from "next/image";
import Link from "next/link";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { messages, rooms, users } from "@/db/schema";
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
    icon: "⚡",
    title: "Live Chat Rooms",
    desc: "Global, squads, memes, tournaments. Messages land in real time — and burn after 3 hours.",
  },
  {
    n: "02",
    icon: "⏳",
    title: "3-Hour Self-Destruct",
    desc: "Every chat message wipes itself after 3 hours. Talk free. What deserves to last, post in the forum.",
  },
  {
    n: "03",
    icon: "🏆",
    title: "Rank Up With XP",
    desc: "Chat +5, topics +10, replies +5 XP. Climb 🥉 Bronze → 👑 Grandmaster on the public ladder.",
  },
  {
    n: "04",
    icon: "🤝",
    title: "Squad Finder",
    desc: "Drop your UID, find serious teammates, push ranked together. No more solo-queue pain.",
  },
  {
    n: "05",
    icon: "🛡️",
    title: "Founding Squad",
    desc: "Only 10 seats at launch. Founders carry a permanent badge in every chat, topic and leaderboard.",
  },
  {
    n: "06",
    icon: "🔐",
    title: "Guard Protected",
    desc: "Rate limits, bot traps and tamper lockdown. Your XP is verified server-side — nobody cheats.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Claim your seat",
    desc: "Pick your IGN, add your Free Fire UID. 10 seconds, ₹0, and the 🛡️ FOUNDER badge is yours.",
  },
  {
    n: "02",
    title: "Drop into chat",
    desc: "Say hi, find a squad, start a topic. Every action earns XP before your words burn in 3h.",
  },
  {
    n: "03",
    title: "Rank up & flex",
    desc: "Climb to Grandmaster, own the leaderboard, and go down in EMBERCROWN history.",
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
  const founding: PublicUser[] = foundingRaw.map((u) => serializeUser(u));
  const globalRoom = allRooms[0];

  // The block veil: sealed players leave no trace on the front page.
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
          <Image
            src="/images/hero.jpg"
            alt="Battle royale squad dropping onto a tropical island"
            fill
            priority
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/75 via-slate-950/60 to-slate-950" />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/30 to-slate-950/70" />
        </div>

        {/* a few quiet embers */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {Array.from({ length: 7 }, (_, i) => (
            <span
              key={i}
              className="ember"
              style={{
                left: `${(i * 13.7 + 6) % 94}%`,
                width: 2 + (i % 2),
                height: 2 + (i % 2),
                animationDelay: `${(i * 1.4) % 9}s`,
                animationDuration: `${9 + (i % 4)}s`,
              }}
            />
          ))}
        </div>

        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-16 sm:pt-24 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          {/* Left: the call */}
          <div>
            <div className="clip-tag inline-flex items-center gap-2 bg-orange-500/15 px-4 py-1.5 font-hud text-[11px] font-bold uppercase tracking-[0.2em] text-orange-300 backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
              {seats.open
                ? `Founding drop — ${seats.left}/${seats.max} seats left`
                : `Squad full — ${fmt(seats.waitlistCount)} on waitlist`}
            </div>

            <h1 className="display-glow mt-6 font-display text-6xl uppercase leading-[0.95] tracking-tight text-white sm:text-8xl">
              <span className="mask-line">
                <span style={{ animationDelay: "0.05s" }}>Talk.</span>
              </span>
              <span className="mask-line">
                <span style={{ animationDelay: "0.18s" }}>Squad.</span>
              </span>
              <span className="mask-line">
                <span className="text-fire" style={{ animationDelay: "0.31s" }}>
                  Booyah!
                </span>
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              The home base of <span className="font-bold text-white">Free Fire players</span>{" "}
              — open to <span className="font-bold text-orange-400">only 10 founding players</span>.
              Chat burns every 3 hours ⏳, XP ranks climb from Bronze to
              Grandmaster, and everything is free. Forever.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/register"
                className="clip-btn btn-glow bg-gradient-to-r from-orange-500 to-amber-400 px-8 py-4 font-display text-sm uppercase tracking-widest text-slate-950 transition hover:-translate-y-0.5 hover:brightness-110"
              >
                {seats.open ? `Claim seat #${seats.taken + 1} →` : "Join waitlist →"}
              </Link>
              <Link
                href="/forum"
                className="clip-btn border-0 bg-white/10 px-8 py-4 font-display text-sm uppercase tracking-widest text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/20"
              >
                Read the forum
              </Link>
            </div>

            {/* Seat HUD */}
            <div className="hud-corners mt-10 max-w-md bg-slate-950/75 p-4 backdrop-blur">
              <div className="flex items-center justify-between font-hud text-[11px] uppercase tracking-[0.18em]">
                <span className="text-slate-400">// founding_squad</span>
                <span className={seats.open ? "text-orange-400" : "text-rose-400"}>
                  {seats.open ? `${seats.left} seats open` : "locked"}
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-10 gap-1.5">
                {Array.from({ length: seats.max }, (_, i) => (
                  <span
                    key={i}
                    className={
                      i < seats.taken
                        ? "clip-tag h-3 bg-gradient-to-r from-orange-500 to-amber-400"
                        : "clip-tag h-3 border border-dashed border-white/25 bg-white/5"
                    }
                  />
                ))}
              </div>
              <p className="mt-2.5 font-hud text-[11px] text-slate-500">
                {fmt(stats.players)} founder{stats.players === 1 ? "" : "s"} in ·{" "}
                {fmt(stats.messages)} messages fired · {fmt(stats.topics)} topics
                archived
              </p>
            </div>
          </div>

          {/* Right: live lobby feed */}
          <div className="hud-corners clip-card relative bg-slate-950/80 p-5 backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <span className="font-hud text-xs font-bold uppercase tracking-[0.2em] text-slate-200">
                  live_feed // global
                </span>
              </div>
              <span className="clip-tag bg-orange-500/15 px-2.5 py-1 font-hud text-[10px] font-bold text-orange-400">
                TTL 3H
              </span>
            </div>
            <div className="mt-4 space-y-4">
              {lobby.length === 0 && (
                <p className="py-6 text-center font-hud text-xs text-slate-500">
                  // quiet in the lobby… be the first to speak
                </p>
              )}
              {lobby.map((r) => (
                <div key={r.message.id} className="flex gap-3">
                  <Avatar
                    name={r.author.username}
                    color={r.author.avatarColor}
                    size={32}
                    dev={r.author.isDev}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-bold text-white">
                        {r.author.username}
                      </span>
                      <span className="font-hud text-[10px] text-slate-500">
                        ⏳ {formatTimeLeft(msUntilExpiry(r.message.createdAt))}
                      </span>
                    </div>
                    <p className="truncate text-sm text-slate-300">
                      {r.message.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/chat"
              className="mt-5 flex items-center justify-between border-t border-white/10 pt-3 font-hud text-xs font-bold uppercase tracking-[0.18em] text-orange-400 transition hover:text-orange-300"
            >
              enter the lobby
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ================= LIVE TICKER ================= */}
      <div className="marquee-pause relative overflow-hidden border-y border-orange-500/20 bg-slate-950 py-3">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-slate-950 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-slate-950 to-transparent" />
        <div className="animate-marquee flex w-max items-center gap-10 px-4 font-hud text-xs text-slate-500">
          {[...ticker, ...ticker].map((m, i) => (
            <span key={i} className="flex items-center gap-2 whitespace-nowrap">
              <span className="font-bold text-orange-400/80">{m.username}</span>
              <span className="text-slate-700">▸</span>
              <span className="max-w-[320px] truncate">{m.content}</span>
              <span className="text-orange-500/30">🔥</span>
            </span>
          ))}
        </div>
      </div>

      {/* ================= FOUNDING SQUAD ================= */}
      <section className="relative border-b border-white/10 bg-gradient-to-b from-amber-950/15 via-slate-950 to-slate-950">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
        <div className="mx-auto max-w-7xl px-4 py-20">
          <Reveal>
            <p className="font-hud text-xs font-bold uppercase tracking-[0.3em] text-amber-400">
              // 10 seats · never reopened
            </p>
            <h2 className="mt-3 font-display text-4xl uppercase text-white sm:text-5xl">
              The <span className="text-fire">Founding Squad</span>
            </h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-slate-400">
              The first 10 players through the doors shape EMBERCROWN forever — and
              carry the 🛡️ <span className="font-bold text-amber-300">FOUNDER</span>{" "}
              badge in every chat, topic and leaderboard. When all 10 seats are
              claimed, the doors weld shut.
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
                      className="hud-corners group block bg-gradient-to-b from-amber-500/15 to-slate-900/40 p-4 text-center transition duration-300 hover:-translate-y-1.5 hover:from-amber-500/25"
                    >
                      <p className="clip-tag inline-block bg-amber-500/20 px-2 py-0.5 font-hud text-[10px] font-bold uppercase tracking-widest text-amber-300">
                        seat #{i + 1}
                      </p>
                      <Avatar
                        name={member.username}
                        color={member.avatarColor}
                        size={54}
                        dev={member.dev}
                        className="mx-auto mt-3 transition-transform duration-300 group-hover:scale-110"
                      />
                      <p className="mt-3 truncate font-display text-sm uppercase tracking-wide text-white">
                        {member.username}
                      </p>
                      <p className="mt-1 font-hud text-[10px] font-bold text-amber-300/90">
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
                    className="group flex h-full flex-col items-center justify-center border-2 border-dashed border-white/15 p-4 text-center transition duration-300 hover:-translate-y-1.5 hover:border-orange-500/60 hover:bg-orange-500/5"
                  >
                    <p className="clip-tag inline-block bg-white/5 px-2 py-0.5 font-hud text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      seat #{i + 1}
                    </p>
                    <span className="mt-3 flex h-[54px] w-[54px] items-center justify-center rounded-full border border-dashed border-white/20 font-display text-xl text-slate-600 transition group-hover:border-orange-500/50 group-hover:text-orange-400">
                      ?
                    </span>
                    <p className="mt-3 font-display text-sm uppercase tracking-wide text-slate-400 transition group-hover:text-orange-400">
                      Your name here
                    </p>
                    <p className="mt-1 font-hud text-[10px] font-bold text-slate-600 transition group-hover:text-orange-500/80">
                      claim it free →
                    </p>
                  </Link>
                </Reveal>
              ) : (
                <div
                  key={`closed-${i}`}
                  className="flex flex-col items-center justify-center border border-white/10 bg-slate-900/50 p-4 text-center opacity-60"
                >
                  <p className="font-hud text-[10px] font-bold uppercase tracking-widest text-slate-600">
                    seat #{i + 1}
                  </p>
                  <span className="mt-3 flex h-[54px] w-[54px] items-center justify-center rounded-full border border-white/10 text-xl">
                    🔒
                  </span>
                  <p className="mt-3 font-display text-sm uppercase text-slate-500">
                    Taken
                  </p>
                </div>
              );
            })}
          </div>

          <Reveal className="mt-8 text-center">
            {seats.open ? (
              <p className="font-hud text-sm font-bold text-slate-300">
                <span className="text-orange-400">{seats.left} seats remaining.</span>{" "}
                When they&apos;re gone, they&apos;re gone.
              </p>
            ) : (
              <p className="font-hud text-sm font-bold text-slate-300">
                All seats claimed.{" "}
                <Link href="/register" className="text-orange-400 hover:underline">
                  Join the waitlist →
                </Link>{" "}
                ({fmt(seats.waitlistCount)} players in line)
              </p>
            )}
          </Reveal>
        </div>
      </section>

      {/* ================= ROOMS ================= */}
      <section className="bg-grid relative">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <Reveal>
            <p className="font-hud text-xs font-bold uppercase tracking-[0.3em] text-orange-400">
              // pick your lobby
            </p>
            <h2 className="mt-3 font-display text-4xl uppercase text-white sm:text-5xl">
              Jump Into a <span className="text-fire">Chat Room</span>
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allRooms.map((room, i) => (
              <Reveal key={room.slug} delay={(i % 3) * 80}>
                <Link
                  href={`/chat/${room.slug}`}
                  className="hud-corners group relative block overflow-hidden bg-slate-900/70 p-5 transition duration-300 hover:-translate-y-1.5 hover:bg-slate-900"
                >
                  <div
                    className="absolute inset-x-0 top-0 h-1 opacity-60 transition-opacity group-hover:opacity-100"
                    style={{ background: room.color }}
                  />
                  <div className="flex items-center justify-between">
                    <span
                      className="clip-tag flex h-11 w-11 items-center justify-center text-xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
                      style={{ backgroundColor: `${room.color}22` }}
                    >
                      {room.icon}
                    </span>
                    <span className="flex items-center gap-1.5 font-hud text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                      live
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-lg uppercase tracking-wide text-white transition group-hover:text-orange-400">
                    {room.name}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    {room.description}
                  </p>
                  <p className="mt-4 font-hud text-xs font-bold uppercase tracking-[0.18em] text-slate-500 transition group-hover:text-orange-400">
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
          <p className="font-hud text-xs font-bold uppercase tracking-[0.3em] text-orange-400">
            // equipped by default
          </p>
          <h2 className="mt-3 font-display text-4xl uppercase text-white sm:text-5xl">
            Built For The <span className="text-fire">Grind</span>
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-x-12 md:grid-cols-2">
          {LOADOUT.map((f, i) => (
            <Reveal key={f.n} delay={(i % 2) * 80}>
              <div className="group flex gap-5 border-l-2 border-white/10 py-6 pl-6 transition duration-300 hover:border-orange-500 hover:pl-8">
                <span className="font-hud text-sm font-bold text-orange-500/70">
                  {f.n}
                </span>
                <div>
                  <h3 className="flex items-center gap-2.5 font-display text-lg uppercase tracking-wide text-white">
                    <span className="transition-transform duration-300 group-hover:scale-125">
                      {f.icon}
                    </span>
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
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
          <div className="hud-corners clip-card bg-gradient-to-br from-slate-900 via-slate-900 to-orange-950/40 p-6 sm:p-10">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-hud text-xs font-bold uppercase tracking-[0.3em] text-orange-400">
                  // hall of fame
                </p>
                <h2 className="mt-2 font-display text-3xl uppercase text-white sm:text-4xl">
                  This Week&apos;s <span className="text-fire">Legends</span>
                </h2>
              </div>
              <Link
                href="/players"
                className="clip-btn bg-white/10 px-6 py-3 font-hud text-xs font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/20"
              >
                full leaderboard →
              </Link>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {topPlayers.map((p, i) => (
                <Link
                  key={p.id}
                  href={`/players/${encodeURIComponent(p.username)}`}
                  className="group flex items-center gap-3 border border-white/10 bg-slate-950/60 p-4 transition duration-300 hover:-translate-y-1 hover:border-orange-500/50"
                >
                  <span className="font-hud text-lg font-bold text-slate-600 transition group-hover:text-orange-500">
                    {i + 1}
                  </span>
                  <Avatar name={p.username} color={p.avatarColor} size={40} dev={p.dev} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{p.username}</p>
                    <RankBadge rank={p.rank} size="xs" />
                    <p className="mt-0.5 font-hud text-[10px] text-slate-500">
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
      <section className="bg-grid border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <Reveal>
            <h2 className="text-center font-display text-4xl uppercase text-white sm:text-5xl">
              From Newbie To <span className="text-fire">Legend</span>
            </h2>
          </Reveal>
          <div className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-6">
            <div className="absolute left-1/2 top-7 hidden h-0.5 w-[66%] -translate-x-1/2 border-t-2 border-dashed border-orange-500/30 md:block" />
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 120} className="relative">
                <div className="text-center">
                  <span className="clip-tag relative z-10 inline-flex h-14 w-14 items-center justify-center bg-gradient-to-br from-orange-500 to-amber-400 font-display text-lg text-slate-950">
                    {s.n}
                  </span>
                  <h3 className="mt-4 font-display text-xl uppercase tracking-wide text-white">
                    {s.title}
                  </h3>
                  <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-400">
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
          <Image
            src="/images/arena.jpg"
            alt="Esports arena crowd with glowing phones"
            fill
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-slate-950/82" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950" />
        </div>
        <div className="relative mx-auto max-w-3xl px-4 py-28 text-center">
          <span className="animate-floaty inline-block text-5xl">🔥</span>
          <h2 className="display-glow mt-5 font-display text-4xl uppercase leading-tight text-white sm:text-6xl">
            The doors close at{" "}
            <span className="text-fire">{seats.max} players</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl leading-relaxed text-slate-300">
            {seats.open
              ? `${seats.left} founding seats remain. After that, EMBERCROWN goes invite-only and everyone else waits in line. Your squad is already in the lobby.`
              : `All ${seats.max} founding seats are claimed — but ${fmt(seats.waitlistCount)} players are holding their spot on the waitlist. Get in line before it grows.`}
          </p>
          <Link
            href="/register"
            className="clip-btn btn-glow mt-9 inline-block bg-gradient-to-r from-orange-500 to-amber-400 px-10 py-4 font-display text-base uppercase tracking-widest text-slate-950 transition hover:-translate-y-0.5 hover:brightness-110"
          >
            {seats.open ? `Claim seat #${seats.taken + 1} — free forever` : "Join the waitlist"}
          </Link>
          <p className="mt-4 font-hud text-xs text-slate-500">
            no payment · no credit card · no ads · just booyahs 🍗
          </p>
        </div>
      </section>
    </div>
  );
}
