"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { BellIcon, CheckIcon } from "@/components/icons";
import { cn, timeAgo, type PublicUser } from "@/lib/utils";

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

function describe(n: NotificationDTO): string {
  const f = TYPE_TEXT[n.type] ?? ((a: string) => `${a} interacted with you`);
  return f(n.actor.username);
}

/**
 * The inbox bell. Two placements:
 *  - "nav"      → sits in the navbar; unread badge comes from the navbar's
 *                 existing /api/me poll (no extra traffic)
 *  - "floating" → bottom-right pill on bare full-screen routes (chat / DMs),
 *                 polls /api/me itself every 45s
 * Interaction: click → fetch inbox once, show panel, mark read. No
 * aggressive background polling anywhere.
 */
export function NotificationBell({
  user,
  floating = false,
  unreadCount,
}: {
  user: PublicUser | null;
  floating?: boolean;
  unreadCount?: number;
}) {
  const pathname = usePathname();
  const isBareRoute =
    pathname === "/chat" ||
    pathname?.startsWith("/chat/") === true ||
    pathname === "/messages" ||
    pathname?.startsWith("/messages/") === true;

  const [selfUnread, setSelfUnread] = useState(0);
  const unread = unreadCount ?? selfUnread;

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDTO[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Self-poll only in floating mode (nav mode is fed by the navbar's poll).
  useEffect(() => {
    if (!floating || !user) return;
    let active = true;
    async function tick() {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (active) setSelfUnread(Number(data.unreadNotifications ?? 0));
      } catch {
        /* the badge simply stays as-is */
      }
    }
    tick();
    const t = setInterval(tick, 45_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [floating, user]);

  const openInbox = useCallback(async () => {
    setOpen((o) => !o);
    if (open) return;
    setLoadError(false);
    setItems(null);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.notifications ?? []);
      if (data.unread > 0) {
        // Opening the inbox acknowledges it — badge clears immediately,
        // the server is the source of truth on the next fetch.
        if (unreadCount === undefined) setSelfUnread(0);
        void fetch("/api/notifications/read", { method: "POST" });
      }
    } catch {
      setLoadError(true);
    }
  }, [open, unreadCount]);

  // Close on Escape / outside interaction.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onDown(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  if (!user) return null;
  if (floating && !isBareRoute) return null;

  const button = (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => void openInbox()}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={
        unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
      }
      className={cn(
        "relative flex items-center justify-center rounded-full border transition",
        floating
          ? "h-11 w-11 border-white/10 bg-[#0a0a0a]/90 shadow-2xl backdrop-blur hover:border-white/25"
          : "h-9 w-9 border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/10",
        open && "border-white/30 bg-white/10",
      )}
    >
      <BellIcon className="h-[18px] w-[18px] text-zinc-200" />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-100 px-1 font-hud text-[9px] font-bold text-black"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );

  const panel = open ? (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notifications"
      className={cn(
        "nice-scroll z-[90] max-h-[420px] w-[min(92vw,360px)] overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl",
        floating
          ? "animate-pop-in fixed bottom-[72px] right-4"
          : "animate-pop-in absolute right-0 top-11",
      )}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <p className="font-hud text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
          Inbox
        </p>
        <Link
          href="/notifications"
          onClick={() => setOpen(false)}
          className="font-hud text-[10px] uppercase tracking-widest text-zinc-500 transition hover:text-zinc-200"
        >
          view all
        </Link>
      </div>

      {loadError && (
        <div className="p-6 text-center">
          <p className="text-sm text-zinc-400">The inbox didn&apos;t load.</p>
          <button
            type="button"
            onClick={() => void openInbox()}
            className="mt-3 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/5"
          >
            Try again
          </button>
        </div>
      )}

      {!loadError && items === null && (
        <div className="space-y-2 p-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex animate-pulse items-center gap-3 p-2">
              <div className="h-8 w-8 rounded-full bg-white/10" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2.5 w-3/4 rounded bg-white/10" />
                <div className="h-2 w-1/2 rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loadError && items !== null && items.length === 0 && (
        <div className="px-4 py-10 text-center">
          <BellIcon className="mx-auto h-6 w-6 text-zinc-600" />
          <p className="mt-3 text-sm font-semibold text-zinc-300">
            Nothing yet.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Replies, likes and requests will land here — quietly, only when
            they matter.
          </p>
        </div>
      )}

      {!loadError &&
        items?.map((n) => (
          <Link
            key={n.id}
            href={n.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-start gap-3 border-b border-white/5 px-4 py-3 transition last:border-0 hover:bg-white/[0.04]",
              !n.read && "bg-white/[0.03]",
            )}
          >
            <Avatar
              name={n.actor.username}
              color={n.actor.avatarColor}
              size={30}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-snug text-zinc-200">
                {describe(n)}
              </span>
              {n.body && (
                <span className="mt-0.5 block truncate text-xs text-zinc-500">
                  “{n.body}”
                </span>
              )}
              <span className="mt-1 block font-hud text-[10px] uppercase tracking-widest text-zinc-600">
                {timeAgo(n.createdAt)}
              </span>
            </span>
            {!n.read && (
              <span
                aria-hidden
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-100"
              />
            )}
          </Link>
        ))}

      {!loadError && items !== null && items.length > 0 && (
        <div className="flex items-center gap-2 border-t border-white/10 px-4 py-2.5">
          <CheckIcon className="h-3.5 w-3.5 text-zinc-500" />
          <p className="font-hud text-[10px] uppercase tracking-widest text-zinc-600">
            marked as read
          </p>
        </div>
      )}
    </div>
  ) : null;

  if (floating) {
    return (
      <div className="fixed bottom-4 right-4 z-[80]">
        {button}
        {panel}
      </div>
    );
  }
  return (
    <div className="relative">
      {button}
      {panel}
    </div>
  );
}
