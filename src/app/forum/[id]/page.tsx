import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar, DevChip, FounderChip, RankBadge } from "@/components/ui";
import { LikeButton } from "@/components/like-button";
import { Replies } from "@/components/replies";
import { db } from "@/db";
import { replies, topicLikes, topics, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { getHiddenUserIds } from "@/lib/social";
import {
  categoryMeta,
  formatDate,
  serializeReply,
  serializeTopic,
  serializeUser,
  timeAgo,
  type ReplyDTO,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const topicId = Number(id);
  if (!Number.isInteger(topicId)) return { title: "Post" };
  const topic = await db
    .select({ title: topics.title })
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);
  return { title: topic[0]?.title ?? "Post" };
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const topicId = Number(id);
  if (!Number.isInteger(topicId)) notFound();

  const user = await getSessionUser();

  const [topicRow, replyRows, likedRow] = await Promise.all([
    db
      .select({ topic: topics, author: users })
      .from(topics)
      .innerJoin(users, eq(topics.userId, users.id))
      .where(eq(topics.id, topicId))
      .limit(1),
    db
      .select({ reply: replies, author: users })
      .from(replies)
      .innerJoin(users, eq(replies.userId, users.id))
      .where(eq(replies.topicId, topicId))
      .orderBy(asc(replies.id))
      .limit(200),
    user
      ? db
          .select()
          .from(topicLikes)
          .where(
            and(eq(topicLikes.topicId, topicId), eq(topicLikes.userId, user.id)),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);

  if (!topicRow[0]) notFound();

  // The block veil: sealed authors and their replies cease to exist here.
  const hidden = user ? await getHiddenUserIds(user.id) : new Set<number>();
  if (hidden.has(topicRow[0].author.id)) notFound();

  const topic = serializeTopic(topicRow[0].topic, topicRow[0].author);
  const replyDtos: ReplyDTO[] = replyRows
    .filter((r) => !hidden.has(r.author.id))
    .map((r) => serializeReply(r.reply, r.author));
  const meta = categoryMeta(topic.category);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 font-hud text-[11px] uppercase tracking-[0.18em] text-zinc-600"
      >
        <Link href="/forum" className="transition hover:text-white">
          Feed
        </Link>
        <span aria-hidden>/</span>
        <Link
          href={`/forum?category=${topic.category}`}
          className="transition hover:text-white"
        >
          {meta.label}
        </Link>
      </nav>

      <article className="mt-6 border-b border-white/[0.1] pb-8">
        <div className="flex flex-wrap items-center gap-2 font-hud text-[10px] uppercase tracking-[0.18em] text-zinc-600">
          <span aria-hidden>{meta.icon}</span>
          <span>{meta.label}</span>
          {topic.pinned && <span>· pinned</span>}
          <span>· {timeAgo(topic.createdAt)}</span>
        </div>
        <h1 className="mt-3 text-balance font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
          {topic.title}
        </h1>

        <div className="mt-6 flex items-center gap-3">
          <Link
            href={`/players/${encodeURIComponent(topic.author.username)}`}
            className="flex items-center gap-3"
          >
            <Avatar
              name={topic.author.username}
              color={topic.author.avatarColor}
              size={42}
              dev={topic.author.dev}
            />
            <span className="block">
              <span className="block text-sm font-semibold text-zinc-100 transition hover:text-white">
                {topic.author.username}
              </span>
              <span className="mt-0.5 block text-xs text-zinc-600">
                {formatDate(topic.createdAt)}
              </span>
            </span>
          </Link>
          <span className="flex items-center gap-1">
            <RankBadge rank={topic.author.rank} size="sm" />
            {topic.author.founder && <FounderChip size="sm" />}
            {topic.author.dev && <DevChip size="sm" />}
          </span>
        </div>

        <div className="mt-6 whitespace-pre-wrap break-words text-[16px] leading-[1.75] text-zinc-200">
          {topic.content}
        </div>

        <div className="mt-7 flex items-center gap-2">
          <LikeButton
            topicId={topic.id}
            initialLikes={topic.likes}
            initiallyLiked={likedRow.length > 0}
            user={user ? serializeUser(user) : null}
            size="md"
          />
          <a
            href="#replies"
            className="rounded-full border border-white/12 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-white/30 hover:text-white"
          >
            Reply
          </a>
        </div>
      </article>

      <div className="mt-8">
        {/* key forces a fresh composer when navigating between posts */}
        <Replies
          key={topic.id}
          topicId={topic.id}
          initialReplies={replyDtos}
          user={user ? serializeUser(user) : null}
        />
      </div>
    </div>
  );
}
