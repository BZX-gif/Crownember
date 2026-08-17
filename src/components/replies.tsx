"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, DevChip, FounderChip, RankBadge } from "@/components/ui";
import { timeAgo } from "@/lib/utils";
import type { PublicUser, ReplyDTO } from "@/lib/utils";

const MAX_LEN = 2000;

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
        return;
      }
      setReplies((prev) => [...prev, data.reply]);
      setContent("");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-black">
        💬 Replies <span className="text-slate-500">({replies.length})</span>
      </h2>

      {replies.length === 0 && (
        <p className="mb-4 rounded-xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-400">
          No replies yet — drop the first one!
        </p>
      )}

      <div className="space-y-3">
        {replies.map((r) => (
          <div
            key={r.id}
            className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"
          >
            <div className="flex flex-wrap items-center gap-x-2">
              <Link
                href={`/players/${encodeURIComponent(r.author.username)}`}
                className="flex items-center gap-2"
              >
                <Avatar
                  name={r.author.username}
                  color={r.author.avatarColor}
                  size={28}
                  dev={r.author.dev}
                />
                <span className="text-sm font-bold text-slate-200 hover:text-white">
                  {r.author.username}
                </span>
              </Link>
              <RankBadge rank={r.author.rank} size="xs" />
              {r.author.founder && <FounderChip size="xs" />}
              {r.author.dev && <DevChip size="xs" />}
              <span className="text-[11px] text-slate-500">
                {timeAgo(r.createdAt)}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-200">
              {r.content}
            </p>
          </div>
        ))}
      </div>

      {user ? (
        <form onSubmit={submit} className="mt-5">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, MAX_LEN))}
            placeholder="Share your thoughts… earn +5 XP per reply 🔥"
            rows={4}
            className="nice-scroll w-full resize-y rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-base sm:text-sm text-white placeholder:text-slate-600 focus:border-orange-500/60 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              {content.length}/{MAX_LEN}
            </span>
            <button
              type="submit"
              disabled={busy || !content.trim()}
              className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-2.5 text-sm font-black text-slate-950 shadow-lg shadow-orange-500/25 transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? "Posting…" : "Post Reply"}
            </button>
          </div>
          {error && (
            <p className="mt-2 text-xs font-semibold text-rose-400">{error}</p>
          )}
        </form>
      ) : (
        <div className="mt-5 rounded-xl border border-white/10 bg-slate-900/60 p-4 text-center text-sm text-slate-300">
          <Link href="/login" className="font-bold text-orange-400 hover:underline">
            Log in
          </Link>{" "}
          or{" "}
          <Link
            href="/register"
            className="font-bold text-orange-400 hover:underline"
          >
            join free
          </Link>{" "}
          to reply and earn XP.
        </div>
      )}
    </div>
  );
}
