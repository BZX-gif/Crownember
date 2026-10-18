"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar, DevChip, FounderChip, RankBadge } from "@/components/ui";
import { SendIcon } from "@/components/icons";
import { cn, timeAgo } from "@/lib/utils";
import type { PublicUser, ReplyDTO } from "@/lib/utils";

const MAX_LEN = 2000;

/**
 * Replies — the conversation under a post.
 * Effortless contract:
 *  - composer sits right under the thread, one field, always visible
 *  - Ctrl/Cmd+Enter submits (hint shown), tab order never traps focus
 *  - double-submit impossible: the button locks and the textarea value is
 *    only cleared after the server confirms persistence
 *  - server errors surface verbatim, the draft is never lost
 */
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
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  async function submit() {
    const text = content.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/forum/topics/${topicId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to post reply.");
        return; // the draft stays — the member can retry
      }
      setReplies((prev) => [...prev, data.reply]);
      setContent("");
      // keep the member in flow: focus stays in the composer
      composerRef.current?.focus();
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function onComposerKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div id="replies">
      <h2 className="flex items-baseline gap-2 font-display text-lg font-bold tracking-tight text-white">
        Replies
        <span className="font-hud text-xs font-normal text-zinc-600">
          {replies.length}
        </span>
      </h2>

      {replies.length === 0 && (
        <p className="mt-4 border-b border-white/[0.06] pb-6 text-sm text-zinc-500">
          No one has replied yet. The first word is yours.
        </p>
      )}

      <div className="divide-y divide-white/[0.06]">
        {replies.map((r) => (
          <div key={r.id} className="flex gap-3 py-4">
            <Link
              href={`/players/${encodeURIComponent(r.author.username)}`}
              className="shrink-0"
              aria-label={`${r.author.username}'s profile`}
            >
              <Avatar
                name={r.author.username}
                color={r.author.avatarColor}
                size={32}
                dev={r.author.dev}
              />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <Link
                  href={`/players/${encodeURIComponent(r.author.username)}`}
                  className="text-sm font-semibold text-zinc-100 transition hover:text-white"
                >
                  {r.author.username}
                </Link>
                <RankBadge rank={r.author.rank} size="xs" />
                {r.author.founder && <FounderChip size="xs" />}
                {r.author.dev && <DevChip size="xs" />}
                <span className="text-xs text-zinc-600">
                  {timeAgo(r.createdAt)}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-zinc-300">
                {r.content}
              </p>
            </div>
          </div>
        ))}
      </div>

      {user ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="mt-4 border-t border-white/[0.08] pt-5"
        >
          <label htmlFor="reply-composer" className="sr-only">
            Write a reply
          </label>
          <div
            className={cn(
              "flex items-end gap-3 rounded-2xl border bg-white/[0.02] p-3 transition focus-within:border-white/30",
              error ? "border-rose-400/40" : "border-white/10",
            )}
          >
            <Avatar
              name={user.username}
              color={user.avatarColor}
              size={30}
              dev={user.dev}
              className="mb-1.5"
            />
            <textarea
              id="reply-composer"
              ref={composerRef}
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, MAX_LEN))}
              onKeyDown={onComposerKeyDown}
              placeholder={`Reply as ${user.username}…`}
              rows={2}
              className="nice-scroll max-h-48 min-h-[42px] w-full resize-y bg-transparent px-1 py-1.5 text-[15px] leading-relaxed text-white placeholder:text-zinc-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !content.trim()}
              aria-label={busy ? "Posting reply" : "Post reply"}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-black transition hover:bg-white active:scale-95 disabled:opacity-30"
            >
              <SendIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between px-1">
            <span className="font-hud text-[10px] uppercase tracking-widest text-zinc-600">
              ctrl↵ to send · {content.length}/{MAX_LEN}
            </span>
            {busy && (
              <span role="status" className="text-xs text-zinc-500">
                Posting…
              </span>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm font-medium text-rose-300">
              {error}
            </p>
          )}
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 border-t border-white/[0.08] pt-6 text-sm text-zinc-400">
          <Link
            href="/login"
            className="font-semibold text-zinc-100 underline underline-offset-4 transition hover:text-white"
          >
            Log in
          </Link>
          or
          <Link
            href="/register"
            className="font-semibold text-zinc-100 underline underline-offset-4 transition hover:text-white"
          >
            join free
          </Link>
          to reply.
        </div>
      )}
    </div>
  );
}
