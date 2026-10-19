"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HeartIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { cn, type PublicUser } from "@/lib/utils";

export function LikeButton({
  topicId,
  initialLikes,
  initiallyLiked,
  user,
  size = "sm",
  className,
}: {
  topicId: number;
  initialLikes: number;
  initiallyLiked: boolean;
  user: PublicUser | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(initiallyLiked);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    if (!user) {
      toast({ title: "Sign in to react", description: "It takes a few seconds to join." });
      router.push("/login");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/forum/topics/${topicId}/like`, {
        method: "POST",
      });
      const data = (await res.json()) as { liked?: boolean; likes?: number; error?: string };
      if (!res.ok) {
        toast({
          title: "Could not update your reaction",
          description: data.error ?? "Try again in a moment.",
          variant: "danger",
        });
        return;
      }
      // No optimistic guess: the count shown is always the server's count.
      setLiked(Boolean(data.liked));
      setLikes(Number(data.likes ?? 0));
    } catch {
      toast({
        title: "Network error",
        description: "Your reaction was not saved. Try again.",
        variant: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={liked}
      aria-label={
        liked
          ? `Remove your like. ${likes} ${likes === 1 ? "like" : "likes"}.`
          : `Like this post. ${likes} ${likes === 1 ? "like" : "likes"}.`
      }
      title={liked ? "Remove like" : "Like"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50",
        size === "md" ? "h-9 px-3 text-sm" : "tap-target h-7 px-2 text-xs",
        liked ? "text-fg" : "text-muted hover:bg-white/[0.05] hover:text-fg",
        className,
      )}
    >
      <HeartIcon
        size={size === "md" ? 16 : 14}
        filled={liked}
        className={cn("transition-transform", liked && "scale-105")}
      />
      <span className="tabular-nums">{likes}</span>
    </button>
  );
}
