"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { PublicUser } from "@/lib/utils";

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

  async function toggle() {
    if (busy) return;
    if (!user) {
      window.location.href = "/login";
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/forum/topics/${topicId}/like`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setLiked(data.liked);
        setLikes(data.likes);
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      className={cn(
        "flex items-center gap-1.5 rounded-full border font-semibold transition",
        size === "md" ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs",
        liked
          ? "border-rose-500/50 bg-rose-500/15 text-rose-400"
          : "border-white/10 bg-white/5 text-slate-300 hover:border-rose-500/40 hover:text-rose-400",
      )}
      title={user ? (liked ? "Unlike" : "Like this topic") : "Log in to like"}
    >
      <span className={cn("transition", liked && "scale-110")}>
        {liked ? "❤️" : "🤍"}
      </span>
      {likes}
    </button>
  );
}
