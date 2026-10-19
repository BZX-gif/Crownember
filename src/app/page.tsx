import Link from "next/link";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { rooms, topicLikes, topics, users } from "@/db/schema";
import { Avatar, FounderChip, RankBadge } from "@/components/ui";
import { PostRow } from "@/components/post-row";
import { BrandMark } from "@/components/brand";
import { EmptyState, RoomGlyph, buttonClass } from "@/components/primitives";
import {
  ActivityIcon,
  ArrowRightIcon,
  ChatIcon,
  ClockIcon,
  FeedIcon,
  ForumIcon,
  LockIcon,
  MailIcon,
  PencilIcon,
  SparkIcon,
  UsersIcon,
} from "@/components/icons";
import { FOUNDING_LIMIT, getSeatStats } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { getRank } from "@/lib/ranks";
import { roomDisplay } from "@/lib/rooms";
import { getHiddenUserIds } from "@/lib/social";
import { serializeTopic, serializeUser, timeAgo, type PublicUser } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SPACES = [
  { href: "/", label: "Feed", Icon: FeedIcon },
  { href: "/forum", label: "Forum", Icon: ForumIcon },
  { href: "/chat", label: "Rooms", Icon: ChatIcon },
  { href: "/messages", label: "Messages", Icon: MailIcon },
  { href: "/players", label: "People", Icon: UsersIcon },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const popular = sort === "popular";
  const user = await getSessionUser();

  const [feeds, topRows, founderRows, roomRows, seats, counts] = await Promise.all([
    db
      .select({ topic: topics, author: users })
      .from(topics)
      .innerJoin(users, eq(topics.userId, users.id))
      .where(eq(users.isBot, false))
      .orderBy(
        popular ? desc(topics.likes) : desc(topics.lastActivityAt),
        desc(topics.lastActivityAt),
      )
      .limit(10),
    db
      .select()
      .from(users)
      .where(eq(users.isBot, false))
      .orderBy(desc(users.xp))
      .limit(5),
    db
      .select()
      .from(users)
      .where(eq(users.isBot, false))
      .orderBy(asc(users.id))
      .limit(FOUNDING_LIMIT),
    db.select().from(rooms).orderBy(asc(rooms.id)),
    getSeatStats(),
    db.execute(sql`
      select
        (select count(*)::int from users where is_bot = false) as members,
        (select count(*)::int
           from topics t join users u on u.id = t.user_id
          where u.is_bot = false) as conversations,
        (select count(*)::int
           from messages m join users u on u.id = m.user_id
          where u.is_bot = false) as messages
    `),
  ]);

  const hidden = user ? await getHiddenUserIds(user.id) : new Set<number>();
  const visibleTopics = feeds.filter((row) => !hidden.has(row.author.id));
  const topicIds = visibleTopics.map((r) => r.topic.id);
  const likedRows =
    user && topicIds.length > 0
      ? await db
          .select({ topicId: topicLikes.topicId })
          .from(topicLikes)
          .where(and(eq(topicLikes.userId, user.id), inArray(topicLikes.topicId, topicIds)))
      : [];
  const liked = new Set(likedRows.map((r) => r.topicId));
  const topMembers = topRows.filter((u) => !hidden.has(u.id)).map(serializeUser);
  const founders = founderRows.filter((u) => !hidden.has(u.id));
  const stats = counts.rows[0] as unknown as {
    members: number;
    conversations: number;
    messages: number;
  };
  const publicUser: PublicUser | null = user ? serializeUser(user) : null;

  return (
    <div>
      {/* ---------------- Editorial header ---------------- */}
      <section className="border-b border-line">
        <div className="page-shell grid gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandMark size={18} />
              <p className="eyebrow">VYRON · Global social platform</p>
            </div>
            <h1 className="display-title mt-5 max-w-3xl text-[2.7rem] text-fg sm:text-6xl">
              Conversations worth
              <br className="hidden sm:block" /> returning to.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
              A permanent forum for ideas that deserve to last, ephemeral rooms
              for the thoughts that do not, and a small community of people who
              show up.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {publicUser ? (
                <>
                  <Link href="/forum/new" className={buttonClass("primary", "md")}>
                    <PencilIcon size={15} /> Write a post
                  </Link>
                  <Link href="/chat" className={buttonClass("secondary", "md")}>
                    Open rooms <ArrowRightIcon size={15} />
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href={seats.open ? "/register" : "/register#waitlist"}
                    className={buttonClass("primary", "md")}
                  >
                    {seats.open ? "Join VYRON" : "Join the waitlist"}
                    <ArrowRightIcon size={15} />
                  </Link>
                  <Link href="/forum" className={buttonClass("secondary", "md")}>
                    Read the forum
                  </Link>
                </>
              )}
            </div>
            <p className="mono-meta mt-5">
              {stats.members} {stats.members === 1 ? "member" : "members"} ·{" "}
              {stats.conversations} {stats.conversations === 1 ? "conversation" : "conversations"} ·{" "}
              {seats.open ? `${seats.left} founding ${seats.left === 1 ? "seat" : "seats"} open` : "Founding membership closed"}
            </p>
          </div>

          <div className="rounded-xl border border-line bg-panel p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-fg">Founding membership</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  The first ten members shape VYRON and keep a permanent Founding badge.
                </p>
              </div>
              <SparkIcon size={18} className="shrink-0 text-muted" />
            </div>
            <div className="mt-5 grid grid-cols-10 gap-1.5" aria-hidden="true">
              {Array.from({ length: seats.max }, (_, i) => (
                <span
                  key={i}
                  className={
                    i < seats.taken
                      ? "h-1.5 rounded-full bg-fg"
                      : "h-1.5 rounded-full border border-line bg-transparent"
                  }
                />
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="mono-meta">
                {seats.taken}/{seats.max} claimed
              </p>
              {seats.open ? (
                <Link
                  href="/register"
                  className="text-xs font-medium text-fg hover:underline"
                >
                  Claim a seat
                </Link>
              ) : (
                <Link
                  href="/register"
                  className="text-xs font-medium text-fg hover:underline"
                >
                  View waitlist
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Feed + rails ---------------- */}
      <div className="page-shell grid gap-10 py-9 lg:grid-cols-[168px_minmax(0,1fr)_272px]">
        <aside className="hidden lg:block">
          <nav aria-label="Spaces" className="sticky top-24 space-y-0.5">
            <p className="eyebrow mb-3 px-2">Spaces</p>
            {SPACES.map(({ href, label, Icon }, index) => (
              <Link
                key={href}
                href={href}
                aria-current={index === 0 ? "page" : undefined}
                className={
                  index === 0
                    ? "flex items-center gap-2.5 rounded-md bg-white/[0.055] px-2.5 py-2 text-[13px] font-medium text-fg"
                    : "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-white/[0.035] hover:text-fg"
                }
              >
                <Icon size={15} />
                {label}
              </Link>
            ))}
            <div className="my-4 hairline" />
            {publicUser ? (
              <Link
                href="/forum/new"
                className="flex items-center gap-2.5 rounded-md border border-line px-2.5 py-2 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                <PencilIcon size={15} /> New post
              </Link>
            ) : (
              <Link
                href="/register"
                className="flex items-center gap-2.5 rounded-md border border-line px-2.5 py-2 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                <SparkIcon size={15} /> Join VYRON
              </Link>
            )}
          </nav>
        </aside>

        <section aria-labelledby="feed-heading">
          {publicUser && (
            <Link
              href="/forum/new"
              className="mb-5 flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3.5 transition-colors hover:border-line-strong"
            >
              <Avatar name={publicUser.username} size={32} dev={publicUser.dev} />
              <span className="flex-1 text-sm text-subtle">
                Share something with the community…
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted">
                <PencilIcon size={14} />
              </span>
            </Link>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <h2 id="feed-heading" className="text-sm font-medium text-fg">
              {popular ? "Popular conversations" : "Latest conversations"}
            </h2>
            <div className="flex items-center gap-1 rounded-lg border border-line p-0.5">
              <Link
                href="/"
                className={
                  popular
                    ? "rounded-md px-2.5 py-1 text-[11px] text-muted transition-colors hover:text-fg"
                    : "rounded-md bg-white/[0.06] px-2.5 py-1 text-[11px] text-fg"
                }
              >
                Latest
              </Link>
              <Link
                href="/?sort=popular"
                className={
                  popular
                    ? "rounded-md bg-white/[0.06] px-2.5 py-1 text-[11px] text-fg"
                    : "rounded-md px-2.5 py-1 text-[11px] text-muted transition-colors hover:text-fg"
                }
              >
                Popular
              </Link>
            </div>
          </div>

          {visibleTopics.length === 0 ? (
            <EmptyState
              className="mt-5"
              icon={<ForumIcon size={18} />}
              title="The first conversation is yours"
              description="VYRON only shows real posts from real members. There is no seeded feed and no invented activity."
              action={
                <Link
                  href={publicUser ? "/forum/new" : "/register"}
                  className={buttonClass("primary", "sm")}
                >
                  {publicUser ? "Start a conversation" : "Join and start one"}
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-line">
              {visibleTopics.map(({ topic, author }) => (
                <PostRow
                  key={topic.id}
                  topic={serializeTopic(topic, author)}
                  user={publicUser}
                  liked={liked.has(topic.id)}
                />
              ))}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <Link
              href="/forum"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-fg"
            >
              Open the full forum <ArrowRightIcon size={13} />
            </Link>
          </div>
        </section>

        <aside className="space-y-8">
          <section aria-labelledby="rooms-heading">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <h2 id="rooms-heading" className="text-sm font-medium text-fg">
                Rooms
              </h2>
              <Link href="/chat" className="text-[11px] text-subtle hover:text-fg">
                All
              </Link>
            </div>
            <div className="mt-2 divide-y divide-line/70">
              {roomRows.map((room) => {
                const display = roomDisplay(room);
                return (
                  <Link
                    key={room.slug}
                    href={`/chat/${room.slug}`}
                    className="group flex items-start gap-3 py-3 transition-colors hover:bg-white/[0.02]"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-muted transition-colors group-hover:text-fg">
                      <RoomGlyph icon={display.icon} size={14} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
                        {display.name}
                        {room.isVault && <LockIcon size={11} className="text-subtle" />}
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-subtle">
                        {display.description}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="people-heading">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <h2 id="people-heading" className="text-sm font-medium text-fg">
                Top members
              </h2>
              <Link href="/players" className="text-[11px] text-subtle hover:text-fg">
                All
              </Link>
            </div>
            <div className="mt-2 divide-y divide-line/70">
              {topMembers.map((member) => (
                <Link
                  key={member.id}
                  href={`/players/${encodeURIComponent(member.username)}`}
                  className="flex items-center gap-2.5 py-2.5 transition-colors hover:bg-white/[0.02]"
                >
                  <Avatar name={member.username} size={26} dev={member.dev} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-fg">{member.username}</span>
                    <span className="block truncate text-[10px] text-subtle">{member.rank.name}</span>
                  </span>
                  <span className="mono-meta shrink-0">{member.xp.toLocaleString()} XP</span>
                </Link>
              ))}
              {topMembers.length === 0 && (
                <p className="py-4 text-xs text-subtle">No members yet.</p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-line p-4">
            <p className="flex items-center gap-2 text-[12px] font-medium text-fg">
              <ClockIcon size={14} className="text-muted" /> Ephemeral by design
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-subtle">
              Public room messages clear after three hours. The Vault clears after
              fourteen minutes and burns its voice notes when anyone leaves. The
              forum is the permanent record.
            </p>
          </section>
        </aside>
      </div>

      {/* ---------------- Founding members ---------------- */}
      <section className="border-y border-line bg-panel/40">
        <div className="page-shell py-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Founding members</p>
              <h2 className="display-title mt-2 text-2xl text-fg sm:text-3xl">
                The people who were here first.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
                A permanent badge, a seat number, and a vote in the direction of
                the community. No payment, no tier above anyone else.
              </p>
            </div>
            {seats.open && (
              <Link href="/register" className={buttonClass("secondary", "sm")}>
                Claim seat #{seats.taken + 1} <ArrowRightIcon size={13} />
              </Link>
            )}
          </div>

          <div className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: seats.max }, (_, index) => {
              const member = founders[index];
              if (member) {
                return (
                  <Link
                    key={`member-${member.id}`}
                    href={`/players/${encodeURIComponent(member.username)}`}
                    className="group rounded-lg border border-line bg-ink/40 p-3.5 transition-colors hover:border-line-strong"
                  >
                    <div className="flex items-center justify-between">
                      <span className="mono-meta">Seat {String(index + 1).padStart(2, "0")}</span>
                      <FounderChip size="xs" />
                    </div>
                    <div className="mt-3 flex items-center gap-2.5">
                      <Avatar name={member.username} size={30} dev={member.isDev} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-fg">
                          {member.username}
                        </p>
                        <p className="truncate text-[10px] text-subtle">
                          {getRank(member.xp).name} · {member.xp.toLocaleString()} XP
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              }
              return (
                <Link
                  key={`open-${index}`}
                  href={seats.open ? "/register" : "/register#waitlist"}
                  className="flex min-h-[88px] flex-col justify-between rounded-lg border border-dashed border-line p-3.5 transition-colors hover:border-line-strong"
                >
                  <span className="mono-meta">Seat {String(index + 1).padStart(2, "0")}</span>
                  <span className="flex items-center justify-between text-[12px] text-muted">
                    Open
                    <ArrowRightIcon size={13} className="text-subtle" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------- Principles ---------------- */}
      <section className="page-shell py-12">
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            {
              Icon: ChatIcon,
              title: "Conversation, not noise",
              body: "No algorithmic rage bait, no invented popularity. Posts are written by people you can open a profile and reply to.",
            },
            {
              Icon: ActivityIcon,
              title: "Earned, never bought",
              body: "Reputation comes from posting, replying and being appreciated by others. There is no paid tier and no shortcut.",
            },
            {
              Icon: LockIcon,
              title: "Private where it matters",
              body: "Rooms self-destruct, the Vault is passcode-sealed, and blocks remove both people from each other's view.",
            },
          ].map(({ Icon, title, body }) => (
            <div key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-muted">
                <Icon size={15} />
              </span>
              <div>
                <h3 className="text-sm font-medium text-fg">{title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
