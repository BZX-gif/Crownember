"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { BellIcon } from "@/components/icons";
import { cn, timeAgo } from "@/lib/utils";

interface NotificationDTO {
  id: number;
  type: string;
  body: string;
  topicId: number | null;
  read: boolean;
  createdAt: string;
  actor: { id: number; username: string; avatarColor: string };
  href: string;
}

const TYPE_TEXT: Record<string, (a: string) => string> = {
  reply: (a) => `${a} replied to your post`,
  like: (a) => `${a} liked your post`,
  friend_request: (a) => `${a} wants to connect`,
  friend_accept: (a) => `${a} accepted your request`,
};

export function NotificationsInbox() {
  const [items, setItems] = useState<NotificationDTO[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.notifications ?? []);
      if (Number(data.unread ?? 0) > 0) {
        void fetch("/api/notifications/read", { method: "POST" });
      }
    } catch {
      setItems(null);
      setError(true);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  if (error) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
        <p className="text-sm text-zinc-400">The inbox didn&apos;t load.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/5"
        >
          Try again
        </button>
      </div>
    );
  }

  if (items === null) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex animate-pulse items-center gap-4 rounded-2xl border border-white/5 p-4"
          >
            <div className="h-10 w-10 rounded-full bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/3 rounded bg-white/10" />
              <div className="h-2.5 w-1/3 rounded bg-white/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center">
        <BellIcon className="mx-auto h-7 w-7 text-zinc-600" />
        <p className="mt-4 font-semibold text-zinc-200">All quiet.</p>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-zinc-500">
          When someone replies to your post, likes it, or asks to connect,
          it lands here. Start something on the{" "}
          <Link href="/forum" className="text-zinc-300 underline underline-offset-4 hover:text-white">
            feed
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10">
      {items.map((n) => (
        <Link
          key={n.id}
          href={n.href}
          className={cn(
            "flex items-start gap-4 border-b border-white/5 px-4 py-4 transition last:border-0 hover:bg-white/[0.03]",
            !n.read && "bg-white/[0.02]",
          )}
        >
          <Avatar name={n.actor.username} color={n.actor.avatarColor} size={38} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] leading-snug text-zinc-100">
              {(TYPE_TEXT[n.type] ?? ((a: string) => `${a} interacted with you`))(
                n.actor.username,
              )}
            </span>
            {n.body && (
              <span className="mt-1 block truncate text-sm text-zinc-500">
                “{n.body}”
              </span>
            )}
            <span className="mt-1.5 block font-hud text-[10px] uppercase tracking-widest text-zinc-600">
              {timeAgo(n.createdAt)}
            </span>
          </span>
          {!n.read && (
            <span
              aria-label="unread"
              className="mt-2 h-2 w-2 shrink-0 rounded-full bg-zinc-100"
            />
          )}
        </Link>
      ))}
    </div>
  );
}
