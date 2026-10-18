"use client";

import Link from "next/link";
import { Avatar, DevChip, FounderChip, RankBadge } from "@/components/ui";
import { PenIcon, ReplyIcon } from "@/components/icons";
import { categoryMeta, timeAgo } from "@/lib/utils";
import type { PublicUser, TopicDTO } from "@/lib/utils";
import { LikeButton } from "@/components/like-button";

/**
 * The feed — one calm column of posts. Hierarchy:
 * author + time (who/when) → title (what) → excerpt → actions (respond).
 * No cards-inside-cards, no borders fighting for attention.
 */
export function TopicList({
  topics,
  likedIds,
  user,
}: {
  topics: TopicDTO[];
  likedIds: number[];
  user: PublicUser | null;
}) {
  return (
    <div className="divide-y divide-white/[0.06]">
      {topics.length === 0 && (
        <div className="py-20 text-center">
          <PenIcon className="mx-auto h-7 w-7 text-zinc-600" />
          <p className="mt-4 font-semibold text-zinc-200">
            Nothing here yet.
          </p>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-zinc-500">
            The first post sets the tone. Make it a good one.
          </p>
          {user && (
            <Link
              href="/forum/new"
              className="mt-6 inline-block rounded-full bg-zinc-100 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-white"
            >
              Write the first post
            </Link>
          )}
        </div>
      )}
      {topics.map((t) => {
        const meta = categoryMeta(t.category);
        return (
          <article key={t.id} className="group py-5 first:pt-0 last:pb-0">
            {/* who / when */}
            <div className="flex items-center gap-2.5 text-sm">
              <Link
                href={`/players/${encodeURIComponent(t.author.username)}`}
                className="flex shrink-0 items-center gap-2.5"
                aria-label={`${t.author.username}'s profile`}
              >
                <Avatar
                  name={t.author.username}
                  color={t.author.avatarColor}
                  size={34}
                  dev={t.author.dev}
                />
              </Link>
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <Link
                  href={`/players/${encodeURIComponent(t.author.username)}`}
                  className="truncate font-semibold text-zinc-100 transition hover:text-white"
                >
                  {t.author.username}
                </Link>
                <RankBadge rank={t.author.rank} size="xs" />
                {t.author.founder && <FounderChip size="xs" />}
                {t.author.dev && <DevChip size="xs" />}
                <span className="text-xs text-zinc-600">
                  {timeAgo(t.lastActivityAt)}
                </span>
              </div>
              <span className="ml-auto flex shrink-0 items-center gap-1.5 font-hud text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                <span aria-hidden>{meta.icon}</span>
                {meta.label}
              </span>
            </div>

            {/* what */}
            <Link
              href={`/forum/${t.id}`}
              className="mt-2.5 block rounded-sm focus-visible:outline-white"
            >
              <h3 className="text-lg font-semibold leading-snug text-white transition group-hover:underline group-hover:decoration-white/30 group-hover:underline-offset-4">
                {t.title}
                {t.pinned && (
                  <span className="ml-2 align-middle font-hud text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    · pinned
                  </span>
                )}
              </h3>
              <p className="mt-1.5 line-clamp-2 text-[15px] leading-relaxed text-zinc-400">
                {t.content}
              </p>
            </Link>

            {/* respond */}
            <div className="mt-3 flex items-center gap-2">
              <Link
                href={`/forum/${t.id}#replies`}
                className="flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-white/30 hover:text-white"
                aria-label={`${t.replyCount} replies — open the conversation`}
              >
                <ReplyIcon className="h-3.5 w-3.5" />
                {t.replyCount > 0 ? `${t.replyCount}` : "Reply"}
              </Link>
              <LikeButton
                topicId={t.id}
                initialLikes={t.likes}
                initiallyLiked={likedIds.includes(t.id)}
                user={user}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}
