import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar, RankBadge } from "@/components/ui";
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
  if (!Number.isInteger(topicId)) return { title: "Topic" };
  const topic = await db
    .select({ title: topics.title })
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);
  return { title: topic[0]?.title ?? "Topic" };
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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/forum" className="font-semibold hover:text-orange-400">
          Forum
        </Link>
        <span>/</span>
        <Link
          href={`/forum?category=${topic.category}`}
          className="font-semibold hover:text-orange-400"
        >
          {meta.icon} {meta.label}
        </Link>
      </nav>

      <article className="mt-4 rounded-3xl border border-white/10 bg-slate-900/70 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-white/5 px-2.5 py-1 font-semibold text-slate-300">
            {meta.icon} {meta.label}
          </span>
          {topic.pinned && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-1 font-bold text-amber-400">
              📌 Pinned
            </span>
          )}
        </div>
        <h1 className="mt-3 font-display text-2xl uppercase leading-tight tracking-wide sm:text-3xl">
          {topic.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-y border-white/10 py-3">
          <Link
            href={`/players/${encodeURIComponent(topic.author.username)}`}
            className="flex items-center gap-2.5"
          >
            <Avatar
              name={topic.author.username}
              color={topic.author.avatarColor}
              size={38}
            />
            <div>
              <p className="text-sm font-bold text-white hover:text-orange-400">
                {topic.author.username}
              </p>
              <p className="text-[11px] text-slate-500">
                {formatDate(topic.createdAt)}
              </p>
            </div>
          </Link>
          <RankBadge rank={topic.author.rank} />
          <div className="ml-auto">
            <LikeButton
              topicId={topic.id}
              initialLikes={topic.likes}
              initiallyLiked={likedRow.length > 0}
              user={user ? serializeUser(user) : null}
              size="md"
            />
          </div>
        </div>

        <div className="mt-5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-200">
          {topic.content}
        </div>
      </article>

      <div className="mt-8">
        <Replies
          topicId={topic.id}
          initialReplies={replyDtos}
          user={user ? serializeUser(user) : null}
        />
      </div>
    </div>
  );
}
