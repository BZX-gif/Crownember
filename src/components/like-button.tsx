"use client";

import { useState } from "react";
import { HeartIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { PublicUser } from "@/lib/utils";

/**
 * The like toggle — deliberately NOT optimistic. The server is the single
 * source of truth: the count only changes when the API confirms it, so a
 * failed request can never leave the UI lying. Visual feedback while the
 * request flies comes from the pressed animation, not a fake number.
 */
export function LikeButton({
  topicId,
  initialLikes,
  initiallyLiked,
  user,
  size = "sm",
}: {
  topicId: number;
  initialLikes: number;
  initiallyLiked: boolean;
  user: PublicUser | null;
  size?: "sm" | "md";
}) {
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(initiallyLiked);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    if (busy) return;
    if (!user) {
      window.location.href = "/login";
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/forum/topics/${topicId}/like`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setLiked(Boolean(data.liked));
        setLikes(Number(data.likes ?? 0));
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={liked}
        aria-label={user ? (liked ? "Remove your like" : "Like this post") : "Log in to like"}
        title={user ? (liked ? "Unlike" : "Like") : "Log in to like"}
        className={cn(
          "group flex items-center gap-1.5 rounded-full border font-semibold transition active:scale-95 disabled:cursor-wait",
          size === "md" ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs",
          liked
            ? "border-white/40 bg-zinc-100 text-black"
            : "border-white/12 bg-white/[0.03] text-zinc-300 hover:border-white/30 hover:text-white",
        )}
      >
        <HeartIcon
          className={cn("transition group-active:scale-125", size === "md" ? "h-4 w-4" : "h-3.5 w-3.5")}
          filled={liked}
        />
        <span aria-live="polite">{likes}</span>
      </button>
      {failed && (
        <span role="status" className="text-[11px] text-rose-300/90">
          didn&apos;t save — tap again
        </span>
      )}
    </span>
  );
}
