import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Avatar, DevChip, FounderChip, RankBadge } from "@/components/ui";
import { EditableAvatar } from "@/components/avatar-editor";
import { PostRow } from "@/components/post-row";
import { ProfileActions } from "@/components/profile-actions";
import { EmptyState, buttonClass } from "@/components/primitives";
import { LockIcon, MailIcon, PencilIcon } from "@/components/icons";
import { db } from "@/db";
import { replies, topicLikes, topics, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { eqLower } from "@/lib/lookup";
import { getBlockState, getRelationship } from "@/lib/social";
import { cn, formatDate, serializeTopic, serializeUser } from "@/lib/utils";
import { getRank } from "@/lib/ranks";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const rows = await db
    .select({ username: users.username, bio: users.bio, xp: users.xp })
    .from(users)
    .where(and(eq(users.isBot, false), eqLower(users.username, username)))
    .limit(1);
  const member = rows[0];
  if (!member) return { title: "Member not found" };
  const description =
    member.bio?.trim() ||
    `Profile and conversations from ${member.username} on VYRON.`;
  return {
    title: member.username,
    description,
    openGraph: {
      title: `${member.username} · VYRON`,
      description,
      type: "profile",
      url: `/players/${encodeURIComponent(member.username)}`,
    },
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      bio: users.bio,
      avatarColor: users.avatarColor,
      avatarMime: users.avatarMime,
      xp: users.xp,
      likes: users.likes,
      createdAt: users.createdAt,
      founder: users.founder,
      isDev: users.isDev,
    })
    .from(users)
    .where(and(eq(users.isBot, false), eqLower(users.username, username)))
    .limit(1);

  const profile = rows[0];
  if (!profile) notFound();
  if (profile.username !== username) {
    redirect(`/players/${encodeURIComponent(profile.username)}`);
  }

  const viewer = await getSessionUser();
  const [relationship, blockState] = viewer
    ? await Promise.all([
        getRelationship(viewer.id, profile.id),
        getBlockState(viewer.id, profile.id),
      ])
    : (["none", { iBlockedThem: false, theyBlockedMe: false, any: false }] as const);

  if (blockState.theyBlockedMe && !blockState.iBlockedThem) {
    return (
      <div className="page-shell max-w-md py-20">
        <div className="rounded-xl border border-line bg-panel p-8 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-line text-muted">
            <LockIcon size={18} />
          </span>
          <h1 className="display-title mt-5 text-2xl text-fg">This profile is sealed</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            A block sits between you. Their posts, replies and profile details are
            removed from your view, and yours are removed from theirs.
          </p>
          <Link href="/players" className={buttonClass("secondary", "sm", "mt-6")}>
            Back to people
          </Link>
        </div>
      </div>
    );
  }

  const [countsRows, recentRows] = await Promise.all([
    db.execute(sql`
      select
        (select count(*)::int from topics where user_id = ${profile.id}) as topics,
        (select count(*)::int from replies where user_id = ${profile.id}) as replies
    `),
    blockState.any
      ? Promise.resolve([])
      : db
          .select({ topic: topics, author: users })
          .from(topics)
          .innerJoin(users, eq(topics.userId, users.id))
          .where(and(eq(topics.userId, profile.id), eq(users.isBot, false)))
          .orderBy(desc(topics.id))
          .limit(6),
  ]);

  const likedRows =
    viewer && recentRows.length > 0
      ? await db
          .select({ topicId: topicLikes.topicId })
          .from(topicLikes)
          .where(
            and(
              eq(topicLikes.userId, viewer.id),
              inArray(topicLikes.topicId, recentRows.map((r) => r.topic.id)),
            ),
          )
      : [];
  const liked = new Set(likedRows.map((r) => r.topicId));

  const rank = getRank(profile.xp);
  const stats = countsRows.rows[0] as unknown as { topics: number; replies: number };
  const isSelf = viewer?.id === profile.id;
  const publicViewer = viewer ? serializeUser(viewer) : null;
  const hasAvatar = Boolean(profile.avatarMime);
  const avatarUrl = hasAvatar
    ? `/api/profile/avatar?username=${encodeURIComponent(profile.username)}`
    : undefined;

  return (
    <div className="page-shell max-w-4xl py-8 sm:py-10">
      <section className="overflow-hidden rounded-xl border border-line bg-panel">
        <div className="h-20 border-b border-line bg-raised sm:h-24" aria-hidden="true" />
        <div className="px-5 pb-6 sm:px-7">
          <div className="flex flex-col gap-3 sm:-mt-11 sm:flex-row sm:items-end sm:gap-5">
            <div className="-mt-9 relative z-10 w-fit rounded-full border-4 border-panel bg-panel shadow-[0_8px_24px_rgba(0,0,0,0.45)] sm:mt-0">
              {isSelf ? (
                <EditableAvatar
                  username={profile.username}
                  size={82}
                  dev={profile.isDev}
                  initialUrl={avatarUrl}
                />
              ) : (
                <Avatar
                  name={profile.username}
                  size={82}
                  dev={profile.isDev}
                  avatarUrl={avatarUrl}
                  decorative={false}
                  loading="eager"
                />
              )}
            </div>
            <div className="min-w-0 flex-1 sm:pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="display-title text-[26px] text-fg sm:text-[30px]">
                  {profile.username}
                </h1>
                <RankBadge rank={rank} size="md" />
                {profile.founder && <FounderChip size="md" />}
                {profile.isDev && <DevChip size="sm" />}
              </div>
              <p className="mono-meta mt-2">
                {rank.name} · Level {rank.level} · Joined {formatDate(profile.createdAt)}
              </p>
            </div>
          </div>

          {viewer && (
            <ProfileActions
              targetUsername={profile.username}
              relationship={relationship}
              iBlockedThem={blockState.iBlockedThem}
              theyBlockedMe={blockState.theyBlockedMe}
            />
          )}
          {!viewer && (
            <p className="mt-3 text-xs text-subtle">
              <Link href="/login" className="text-fg hover:underline">
                Sign in
              </Link>{" "}
              to add a friend, send a message or manage a block.
            </p>
          )}

          {profile.bio && (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#d4d4d8]">
              {profile.bio}
            </p>
          )}

          <div className="mt-6 rounded-lg border border-line bg-ink/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-muted">
                {rank.name} · Level {rank.level}
              </span>
              <span className="mono-meta">
                {rank.nextMinXp !== null
                  ? `${profile.xp.toLocaleString()} / ${rank.nextMinXp.toLocaleString()} XP`
                  : `${profile.xp.toLocaleString()} XP · highest tier`}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-fg/80"
                style={{ width: `${Math.max(2, rank.progress * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-subtle">
              {rank.nextMinXp !== null
                ? `${Math.max(0, rank.nextMinXp - profile.xp).toLocaleString()} XP to ${getRank(rank.nextMinXp).name}.`
                : "The highest reputation tier on VYRON."}
            </p>
          </div>

          <dl className="mt-5 grid grid-cols-2 divide-x divide-line rounded-lg border border-line sm:grid-cols-4">
            {[
              { label: "Topics", value: stats.topics },
              { label: "Replies", value: stats.replies },
              { label: "Appreciation", value: profile.likes },
              { label: "Reputation", value: profile.xp },
            ].map((item, index) => (
              <div
                key={item.label}
                className={cn(
                  "px-4 py-3.5",
                  index > 1 && "border-t border-line sm:border-t-0",
                )}
              >
                <dt className="text-[11px] uppercase tracking-[0.08em] text-subtle">
                  {item.label}
                </dt>
                <dd className="mt-1.5 text-lg font-medium leading-none tabular-nums text-fg">
                  {item.value.toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-3 text-[11px] leading-relaxed text-subtle">
            Chat history is private. Only forum activity is shown here.
          </p>
        </div>
      </section>

      <section className="mt-9" aria-labelledby="activity-heading">
        <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
          <h2 id="activity-heading" className="text-sm font-medium text-fg">
            Conversations
          </h2>
          {isSelf && (
            <Link
              href="/forum/new"
              className="tap-target inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted transition-colors hover:bg-white/[0.04] hover:text-fg"
            >
              <PencilIcon size={13} /> New post
            </Link>
          )}
        </div>

        {blockState.any ? (
          <EmptyState
            className="mt-5"
            icon={<LockIcon size={17} />}
            title="Activity hidden"
            description="A block removes both members from each other's public activity."
          />
        ) : recentRows.length === 0 ? (
          <EmptyState
            className="mt-5"
            title="No conversations yet"
            description={
              isSelf
                ? "Your posts will appear here. Start with something you would want to reply to."
                : "This member has not started a conversation yet."
            }
            action={
              isSelf ? (
                <Link href="/forum/new" className={buttonClass("primary", "sm")}>
                  Write your first post
                </Link>
              ) : (
                <Link
                  href={`/messages/${encodeURIComponent(profile.username)}`}
                  className={buttonClass("secondary", "sm")}
                >
                  <MailIcon size={14} /> Send a message
                </Link>
              )
            }
          />
        ) : (
          <div className="divide-y divide-line">
            {recentRows.map(({ topic, author }) => (
              <PostRow
                key={topic.id}
                topic={serializeTopic(topic, author)}
                user={publicViewer}
                liked={liked.has(topic.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
