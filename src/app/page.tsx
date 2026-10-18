import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { topics, users } from "@/db/schema";
import { Avatar, FounderChip, RankBadge } from "@/components/ui";
import { VyMark } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { getSessionUser } from "@/lib/auth";
import { getHiddenUserIds } from "@/lib/social";
import { serializeUser, timeAgo, type PublicUser } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    n: "01",
    title: "The Feed",
    desc: "Posts that stay. Write once, keep forever — clean threads, real replies, effortless likes.",
  },
  {
    n: "02",
    title: "Live Rooms",
    desc: "Conversation in the moment. Every message fades after three hours — presence over permanence.",
  },
  {
    n: "03",
    title: "Direct Messages",
    desc: "Private one-to-one threads. Quiet, encrypted-by-transport, and sealed the moment someone blocks.",
  },
  {
    n: "04",
    title: "The Vault",
    desc: "A passcode-sealed inner circle with voice notes that burn when the room empties.",
  },
  {
    n: "05",
    title: "A Calm Inbox",
    desc: "Replies, likes and requests — and nothing else. Notifications that respect your attention.",
  },
  {
    n: "06",
    title: "The Guard",
    desc: "Server-side moderation, rate limits and verification. The rules are enforced where they can't be faked.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Claim your name",
    desc: "One username, one password, ten seconds. Free forever — no card, no ads, no tiers.",
  },
  {
    n: "02",
    title: "Say something real",
    desc: "Post on the feed or drop into a room. Every contribution earns XP.",
  },
  {
    n: "03",
    title: "Find your people",
    desc: "Follow the conversations that matter. Build a reputation that is yours.",
  },
];

export default async function HomePage() {
  const viewer = await getSessionUser();

  const [statsRows, topPlayersRaw, latestRaw] = await Promise.all([
    db.execute(sql`
      select
        (select count(*)::int from users where is_bot = false) as members,
        (select count(*)::int from topics) as posts,
        (select count(*)::int from replies) as replies,
        (select count(*)::int from rooms) as rooms
    `),
    db
      .select()
      .from(users)
      .where(eq(users.isBot, false))
      .orderBy(desc(users.xp))
      .limit(5),
    db
      .select({ topic: topics, author: users })
      .from(topics)
      .innerJoin(users, eq(topics.userId, users.id))
      .orderBy(desc(topics.lastActivityAt))
      .limit(5),
  ]);

  const stats = statsRows.rows[0] as unknown as {
    members: number;
    posts: number;
    replies: number;
    rooms: number;
  };
  const topPlayers: PublicUser[] = topPlayersRaw.map((u) => serializeUser(u));

  // The block veil: sealed members leave no trace, even on the front page.
  const hiddenIds = viewer
    ? await getHiddenUserIds(viewer.id)
    : new Set<number>();
  const latest = latestRaw.filter((r) => !hiddenIds.has(r.author.id));

  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <div>
      {/* ================= HERO ================= */}
      <section className="hero-haze relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-20 sm:pt-28">
          <div className="flex flex-col items-center text-center">
            <VyMark className="brand-sheen h-16 w-16 sm:h-20 sm:w-20" />
            <h1 className="mt-10 font-display text-[17vw] font-bold uppercase leading-[0.9] tracking-tight text-white sm:text-8xl md:text-9xl">
              <span className="mask-line">
                <span style={{ animationDelay: "0.05s" }}>VYRON</span>
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-balance text-lg leading-relaxed text-zinc-400 sm:text-xl">
              The social platform for people who value the conversation.
              Black, white, and everything you actually said.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              {viewer ? (
                <>
                  <Link
                    href="/forum"
                    className="rounded-full bg-zinc-100 px-8 py-3.5 text-sm font-semibold text-black transition hover:bg-white"
                  >
                    Open the feed
                  </Link>
                  <Link
                    href="/forum/new"
                    className="rounded-full border border-white/15 px-8 py-3.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
                  >
                    Write a post
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/register"
                    className="rounded-full bg-zinc-100 px-8 py-3.5 text-sm font-semibold text-black transition hover:bg-white"
                  >
                    Claim your name — free
                  </Link>
                  <Link
                    href="/forum"
                    className="rounded-full border border-white/15 px-8 py-3.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
                  >
                    Read the feed
                  </Link>
                </>
              )}
            </div>

            {/* real counters — nothing vanity, nothing invented */}
            <dl className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4">
              {[
                { k: "members", v: stats.members },
                { k: "posts", v: stats.posts },
                { k: "replies", v: stats.replies },
                { k: "rooms", v: stats.rooms },
              ].map((s) => (
                <div key={s.k} className="bg-[#0a0a0a] px-8 py-5">
                  <dd className="font-display text-3xl font-bold text-white">
                    {fmt(s.v)}
                  </dd>
                  <dt className="mt-1 font-hud text-[10px] uppercase tracking-[0.25em] text-zinc-600">
                    {s.k}
                  </dt>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ================= LATEST FROM THE FEED ================= */}
      <section className="border-t border-white/[0.07]">
        <div className="mx-auto max-w-4xl px-4 py-16">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-hud text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-600">
                  live now
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  The conversation so far
                </h2>
              </div>
              <Link
                href="/forum"
                className="font-hud text-xs font-bold uppercase tracking-[0.2em] text-zinc-400 transition hover:text-white"
              >
                open feed →
              </Link>
            </div>
          </Reveal>
          <div className="mt-8 divide-y divide-white/[0.06] rounded-2xl border border-white/10">
            {latest.length === 0 && (
              <p className="p-8 text-center text-sm text-zinc-500">
                The feed is quiet. The first post is always the hardest —
                make it yours.
              </p>
            )}
            {latest.map(({ topic, author }) => (
              <Link
                key={topic.id}
                href={`/forum/${topic.id}`}
                className="group flex items-center gap-4 p-5 transition hover:bg-white/[0.03]"
              >
                <Avatar
                  name={author.username}
                  color={author.avatarColor}
                  size={38}
                  dev={author.isDev}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-zinc-100 transition group-hover:text-white">
                    {topic.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {author.username} · {timeAgo(topic.lastActivityAt)}
                  </span>
                </span>
                <span className="hidden shrink-0 items-center gap-4 font-hud text-[11px] text-zinc-600 sm:flex">
                  <span>♥ {topic.likes}</span>
                  <span>↩ {topic.replyCount}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section className="border-t border-white/[0.07] bg-grid">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <Reveal>
            <p className="font-hud text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-600">
              the instrument
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Everything essential.
              <br />
              Nothing decorative.
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div key={f.n} className="bg-[#0a0a0a] p-7">
                <Reveal delay={(i % 3) * 70}>
                  <p className="font-hud text-xs font-bold text-zinc-600">
                    {f.n}
                  </p>
                  <h3 className="mt-3 font-display text-lg font-bold tracking-tight text-white">
                    {f.title}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-zinc-500">
                    {f.desc}
                  </p>
                </Reveal>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= MEMBERS ================= */}
      <section className="border-t border-white/[0.07]">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-hud text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-600">
                  earned, never bought
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  The members leading it
                </h2>
              </div>
              <Link
                href="/players"
                className="font-hud text-xs font-bold uppercase tracking-[0.2em] text-zinc-400 transition hover:text-white"
              >
                all members →
              </Link>
            </div>
          </Reveal>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {topPlayers.map((p, i) => (
              <Reveal key={p.id} delay={i * 60}>
                <Link
                  href={`/players/${encodeURIComponent(p.username)}`}
                  className="group block rounded-2xl border border-white/10 bg-[#0a0a0a] p-5 transition hover:-translate-y-1 hover:border-white/25"
                >
                  <div className="flex items-center justify-between">
                    <Avatar
                      name={p.username}
                      color={p.avatarColor}
                      size={44}
                      dev={p.dev}
                    />
                    <span className="font-hud text-lg font-bold text-zinc-700 transition group-hover:text-zinc-400">
                      {i + 1}
                    </span>
                  </div>
                  <p className="mt-4 truncate font-semibold text-white">
                    {p.username}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <RankBadge rank={p.rank} size="xs" />
                    {p.founder && <FounderChip size="xs" />}
                  </div>
                  <p className="mt-2 font-hud text-[10px] uppercase tracking-widest text-zinc-600">
                    {fmt(p.xp)} XP
                  </p>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= HOW ================= */}
      <section className="border-t border-white/[0.07]">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <Reveal>
            <h2 className="text-center font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Three steps. No fine print.
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-6">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 100} className="relative">
                <div className="text-center">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 font-hud text-sm font-bold text-zinc-300">
                    {s.n}
                  </span>
                  <h3 className="mt-5 font-display text-xl font-bold tracking-tight text-white">
                    {s.title}
                  </h3>
                  <p className="mx-auto mt-2.5 max-w-xs text-sm leading-relaxed text-zinc-500">
                    {s.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FINAL CTA ================= */}
      <section className="hero-haze border-t border-white/[0.07]">
        <div className="mx-auto max-w-3xl px-4 py-28 text-center">
          <VyMark className="mx-auto h-12 w-12" />
          <h2 className="mt-8 font-display text-4xl font-bold tracking-tight text-white sm:text-6xl">
            Your name is still available.
          </h2>
          <p className="mx-auto mt-5 max-w-md leading-relaxed text-zinc-400">
            Probably. The good ones go first — and membership costs exactly
            nothing, today and every day after.
          </p>
          <Link
            href="/register"
            className="mt-10 inline-block rounded-full bg-zinc-100 px-10 py-4 text-sm font-semibold text-black transition hover:bg-white"
          >
            Join VYRON — free forever
          </Link>
          <p className="mt-5 font-hud text-[10px] uppercase tracking-[0.25em] text-zinc-700">
            no card · no ads · no noise
          </p>
        </div>
      </section>
    </div>
  );
}
