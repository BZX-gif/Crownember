"use client";

import Link from "next/link";
import { useState } from "react";
import { LikeButton } from "@/components/like-button";
import { ReplyComposer } from "@/components/reply-composer";
import { ReplyIcon } from "@/components/icons";
import type { PublicUser, ReplyDTO } from "@/lib/utils";

export function TopicActions({
  topicId,
  initialLikes,
  initiallyLiked,
  replyCount,
  user,
}: {
  topicId: number;
  initialLikes: number;
  initiallyLiked: boolean;
  replyCount: number;
  user: PublicUser | null;
}) {
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [count, setCount] = useState(replyCount);

  function onPosted(_reply: ReplyDTO) {
    setCount((c) => c + 1);
    setRepliesOpen(false);
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-0.5">
        <LikeButton
          topicId={topicId}
          initialLikes={initialLikes}
          initiallyLiked={initiallyLiked}
          user={user}
        />
        <Link
          href={`/forum/${topicId}#composer`}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted transition-colors hover:bg-white/[0.05] hover:text-fg"
          aria-label={`${count} ${count === 1 ? "reply" : "replies"}. Open conversation.`}
        >
          <ReplyIcon size={14} />
          <span className="tabular-nums">{count}</span>
        </Link>
        {user ? (
          <button
            type="button"
            onClick={() => setRepliesOpen((v) => !v)}
            aria-expanded={repliesOpen}
            className="inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-muted transition-colors hover:bg-white/[0.05] hover:text-fg"
          >
            {repliesOpen ? "Cancel" : "Reply"}
          </button>
        ) : (
          <Link
            href="/login"
            className="inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-muted transition-colors hover:bg-white/[0.05] hover:text-fg"
          >
            Reply
          </Link>
        )}
      </div>

      {repliesOpen && user && (
        <div className="mt-3 rounded-lg border border-line bg-raised p-3">
          <ReplyComposer
            topicId={topicId}
            user={user}
            onPosted={onPosted}
            compact
            autoFocus
            notifyOnSuccess
          />
        </div>
      )}
    </div>
  );
}
