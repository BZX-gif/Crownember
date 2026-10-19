"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar, DevChip, FounderChip, RankBadge } from "@/components/ui";
import { ReplyComposer } from "@/components/reply-composer";
import { EmptyState } from "@/components/primitives";
import { ForumIcon } from "@/components/icons";
import { cn, timeAgo, type PublicUser, type ReplyDTO } from "@/lib/utils";

export function Replies({
  topicId,
  initialReplies,
  user,
}: {
  topicId: number;
  initialReplies: ReplyDTO[];
  user: PublicUser | null;
}) {
  const [replies, setReplies] = useState<ReplyDTO[]>(initialReplies);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.location.hash !== "#composer") return;
    const el = document.getElementById("composer");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const textarea = el?.querySelector("textarea");
    textarea?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      id="replies"
      ref={sectionRef}
      aria-labelledby="replies-heading"
      className="mt-9 scroll-mt-20"
    >
      <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
        <h2 id="replies-heading" className="text-sm font-medium text-fg">
          Replies <span className="ml-1 text-subtle">{replies.length}</span>
        </h2>
        <p className="mono-meta hidden sm:block">Chronological</p>
      </div>

      <div className="mt-4">
        {user ? (
          <ReplyComposer
            id="composer"
            topicId={topicId}
            user={user}
            onPosted={(reply) => setReplies((prev) => [...prev, reply])}
            className="rounded-xl border border-line bg-panel p-4"
          />
        ) : (
          <div className="rounded-xl border border-line bg-panel px-5 py-4 text-sm text-muted">
            <Link href="/login" className="font-medium text-fg hover:underline">
              Sign in
            </Link>{" "}
            or{" "}
            <Link href="/register" className="font-medium text-fg hover:underline">
              join VYRON
            </Link>{" "}
            to add your reply to this conversation.
          </div>
        )}
      </div>

      {replies.length === 0 ? (
        <EmptyState
          className="mt-5"
          icon={<ForumIcon size={17} />}
          title="No replies yet"
          description="Be the first to add something useful. Replies earn reputation and stay in the archive."
        />
      ) : (
        <div className="mt-6 divide-y divide-line border-t border-line">
          {replies.map((reply, index) => (
            <article key={reply.id} className="flex gap-3.5 py-5">
              <div className="flex w-7 shrink-0 flex-col items-center">
                <Link
                  href={`/players/${encodeURIComponent(reply.author.username)}`}
                  className="rounded-full"
                  aria-label={`${reply.author.username}'s profile`}
                >
                  <Avatar name={reply.author.username} size={28} dev={reply.author.dev} />
                </Link>
                {index < replies.length - 1 && (
                  <span className="mt-2 w-px flex-1 bg-line" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    href={`/players/${encodeURIComponent(reply.author.username)}`}
                    className="text-[13px] font-medium text-fg hover:text-white"
                  >
                    {reply.author.username}
                  </Link>
                  <RankBadge rank={reply.author.rank} size="xs" />
                  {reply.author.founder && <FounderChip size="xs" />}
                  {reply.author.dev && <DevChip size="xs" />}
                  <span className="text-subtle" aria-hidden="true">·</span>
                  <time
                    dateTime={new Date(reply.createdAt).toISOString()}
                    className="text-[11px] text-subtle"
                  >
                    {timeAgo(reply.createdAt)}
                  </time>
                </div>
                <p
                  className={cn(
                    "prose-body mt-1.5 text-[14px]",
                    reply.author.dev && "font-mono text-[13px] text-fg",
                  )}
                >
                  {reply.content}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
