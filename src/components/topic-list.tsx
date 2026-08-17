"use client";

import Link from "next/link";
import { Avatar, DevChip, FounderChip, RankBadge } from "@/components/ui";
import { categoryMeta, timeAgo } from "@/lib/utils";
import type { PublicUser, TopicDTO } from "@/lib/utils";
import { LikeButton } from "@/components/like-button";

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
    <div className="space-y-3">
      {topics.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-10 text-center">
          <p className="text-4xl">🦗</p>
          <p className="mt-2 font-bold">No topics here yet.</p>
          <p className="text-sm text-slate-400">
            Be the first — start a topic and earn +10 XP!
          </p>
        </div>
      )}
      {topics.map((t) => {
        const meta = categoryMeta(t.category);
        return (
          <article
            key={t.id}
            className="group rounded-2xl border border-white/10 bg-slate-900/60 p-4 transition hover:border-orange-500/30 hover:bg-slate-900"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-white/5 px-2.5 py-1 font-semibold text-slate-300">
                {meta.icon} {meta.label}
              </span>
              {t.pinned && (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-1 font-bold text-amber-400">
                  📌 Pinned
                </span>
              )}
              <span className="text-slate-500">{timeAgo(t.lastActivityAt)}</span>
            </div>
            <Link href={`/forum/${t.id}`}>
              <h3 className="mt-2 text-lg font-bold leading-snug text-white transition group-hover:text-orange-400">
                {t.title}
              </h3>
            </Link>
            <p className="mt-1 line-clamp-2 text-sm text-slate-400">
              {t.content}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Link
                href={`/players/${encodeURIComponent(t.author.username)}`}
                className="flex items-center gap-2"
              >
                <Avatar
                  name={t.author.username}
                  color={t.author.avatarColor}
                  size={26}
                  dev={t.author.dev}
                />
                <span className="text-sm font-semibold text-slate-300 hover:text-white">
                  {t.author.username}
                </span>
                <RankBadge rank={t.author.rank} size="xs" />
                {t.author.founder && <FounderChip size="xs" />}
                {t.author.dev && <DevChip size="xs" />}
              </Link>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-xs text-slate-500">
                  💬 {t.replyCount} replies
                </span>
                <LikeButton
                  topicId={t.id}
                  initialLikes={t.likes}
                  initiallyLiked={likedIds.includes(t.id)}
                  user={user}
                />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
