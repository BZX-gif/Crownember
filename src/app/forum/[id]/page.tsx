import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar, DevChip, FounderChip, RankBadge } from "@/components/ui";
import { LikeButton } from "@/components/like-button";
import { Replies } from "@/components/replies";
import { CategoryChip } from "@/components/primitives";
import { ArrowLeftIcon, PinIcon, ReplyIcon } from "@/components/icons";
import { db } from "@/db";
import { replies, topicLikes, topics, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { getHiddenUserIds } from "@/lib/social";
import {
  categoryMeta,
  formatDate,
  serializeReply,
  avatarUrlFor,
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
  if (!Number.isInteger(topicId)) return { title: "Conversation" };
  const topic = await db
    .select({ title: topics.title })
    .from(topics)
    .innerJoin(users, eq(topics.userId, users.id))
    .where(and(eq(topics.id, topicId), eq(users.isBot, false)))
    .limit(1);
  return { title: topic[0]?.title ?? "Conversation" };
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

  const [topicRows, replyRows, likedRows] = await Promise.all([
    db
      .select({ topic: topics, author: users })
      .from(topics)
      .innerJoin(users, eq(topics.userId, users.id))
      .where(and(eq(topics.id, topicId), eq(users.isBot, false)))
      .limit(1),
    db
      .select({ reply: replies, author: users })
      .from(replies)
      .innerJoin(users, eq(replies.userId, users.id))
      .where(and(eq(replies.topicId, topicId), eq(users.isBot, false)))
      .orderBy(asc(replies.id))
      .limit(200),
    user
      ? db
          .select({ id: topicLikes.id })
          .from(topicLikes)
          .where(and(eq(topicLikes.topicId, topicId), eq(topicLikes.userId, user.id)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  if (!topicRows[0]) notFound();

  const hidden = user ? await getHiddenUserIds(user.id) : new Set<number>();
  if (hidden.has(topicRows[0].author.id)) notFound();

  const topic = serializeTopic(topicRows[0].topic, topicRows[0].author);
  const replyDtos: ReplyDTO[] = replyRows
    .filter((r) => !hidden.has(r.author.id))
    .map((r) => serializeReply(r.reply, r.author));
  const meta = categoryMeta(topic.category);
  const publicUser = user ? serializeUser(user) : null;

  return (
    <div className="page-shell max-w-3xl py-8 sm:py-10">
      <nav className="flex flex-wrap items-center gap-2 text-xs text-subtle">
        <Link
          href="/forum"
          className="inline-flex items-center gap-1.5 transition-colors hover:text-fg"
        >
          <ArrowLeftIcon size={12} /> Forum
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          href={`/forum?category=${topic.category}`}
          className="transition-colors hover:text-fg"
        >
          {meta.label}
        </Link>
      </nav>

      <article className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryChip icon={meta.icon} label={meta.label} />
          {topic.pinned && (
            <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
              <PinIcon size={11} /> Pinned
            </span>
          )}
        </div>

        <h1 className="display-title mt-3 text-3xl text-fg sm:text-[2.5rem]">
          {topic.title}
        </h1>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-b border-line pb-4">
          <Link
            href={`/players/${encodeURIComponent(topic.author.username)}`}
            className="flex items-center gap-2.5"
          >
            <Avatar name={topic.author.username} size={36} dev={topic.author.dev} avatarUrl={avatarUrlFor(topic.author)} />
            <span>
              <span className="block text-[13px] font-medium text-fg">
                {topic.author.username}
              </span>
              <time
                dateTime={new Date(topic.createdAt).toISOString()}
                className="block text-[11px] text-subtle"
              >
                {formatDate(topic.createdAt)}
              </time>
            </span>
          </Link>
          <RankBadge rank={topic.author.rank} />
          {topic.author.founder && <FounderChip size="sm" />}
          {topic.author.dev && <DevChip />}
          <div className="ml-auto flex items-center gap-1">
            <LikeButton
              topicId={topic.id}
              initialLikes={topic.likes}
              initiallyLiked={likedRows.length > 0}
              user={publicUser}
              size="md"
            />
            <Link
              href="#composer"
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-muted transition-colors hover:bg-white/[0.05] hover:text-fg"
            >
              <ReplyIcon size={15} /> Reply
            </Link>
          </div>
        </div>

        <p className="prose-body mt-6 text-[15px] leading-[1.8]">{topic.content}</p>
      </article>

      <Replies topicId={topic.id} initialReplies={replyDtos} user={publicUser} />
    </div>
  );
}
