"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { PublicUser } from "@/lib/utils";

interface RoomSummary {
  slug: string;
  name: string;
  isVault: boolean;
  locked: boolean;
}

interface ChatMessage {
  id: number;
  content: string;
  user: { id: number; username: string };
}

interface DmThread {
  other: { username: string };
  lastContent: string;
  lastAt: string;
  lastFromMe: boolean;
}

function canNotify() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function NotificationCenter({ user }: { user: PublicUser | null }) {
  const pathname = usePathname();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "default",
  );
  const [enabled, setEnabled] = useState(false);
  const roomCursors = useRef(new Map<string, number>());
  const dmCursors = useRef(new Map<string, number>());
  const bootstrapped = useRef(false);
  const notifying = useRef(false);

  useEffect(() => {
    if (!canNotify()) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const notify = useCallback(
    (title: string, body: string, href: string) => {
      if (!enabled || !canNotify() || Notification.permission !== "granted") return;
      if (notifying.current) return;
      notifying.current = true;
      try {
        const n = new Notification(title, {
          body: body.slice(0, 180),
          tag: `crownember-${href}`,
          icon: "/favicon.ico",
        });
        n.onclick = () => {
          window.focus();
          window.location.href = href;
          n.close();
        };
      } catch {
        // Browser/OS refused the notification; leave chat untouched.
      } finally {
        window.setTimeout(() => {
          notifying.current = false;
        }, 250);
      }
    },
    [enabled],
  );

  const poll = useCallback(async () => {
    if (!user || !enabled || !canNotify() || Notification.permission !== "granted") {
      return;
    }

    try {
      const roomsRes = await fetch("/api/chat/rooms", { cache: "no-store" });
      if (!roomsRes.ok) return;
      const roomsData = (await roomsRes.json()) as { rooms?: RoomSummary[] };
      const rooms = (roomsData.rooms ?? []).filter((r) => !r.isVault && !r.locked);

      for (const room of rooms) {
        const after = roomCursors.current.get(room.slug) ?? 0;
        const res = await fetch(
          `/api/chat/messages?room=${encodeURIComponent(room.slug)}&after=${after}`,
          { cache: "no-store" },
        );
        if (!res.ok) continue;
        const data = (await res.json()) as { messages?: ChatMessage[] };
        const messages = data.messages ?? [];
        if (messages.length === 0) continue;

        const newest = Math.max(...messages.map((m) => m.id));
        roomCursors.current.set(room.slug, newest);

        // First successful read establishes the cursor; existing messages
        // must never produce a notification when notifications are enabled.
        if (!bootstrapped.current || after === 0) continue;

        for (const message of messages) {
          if (message.id <= after || message.user.id === user.id) continue;
          const sameRoom = pathname === `/chat/${room.slug}`;
          if (document.visibilityState === "visible" && sameRoom) continue;
          notify(
            `${message.user.username} · ${room.name}`,
            message.content,
            `/chat/${encodeURIComponent(room.slug)}`,
          );
        }
      }

      const dmRes = await fetch("/api/dm/threads", { cache: "no-store" });
      if (dmRes.ok) {
        const dmData = (await dmRes.json()) as { threads?: DmThread[] };
        for (const thread of dmData.threads ?? []) {
          if (thread.lastFromMe) continue;
          const key = thread.other.username;
          const timestamp = new Date(thread.lastAt).getTime();
          const previous = dmCursors.current.get(key) ?? 0;
          dmCursors.current.set(key, timestamp);
          if (!bootstrapped.current || previous === 0 || timestamp <= previous) continue;
          if (document.visibilityState === "visible" && pathname.startsWith("/messages/")) continue;
          notify(
            `Message from ${thread.other.username}`,
            thread.lastContent,
            `/messages/${encodeURIComponent(thread.other.username)}`,
          );
        }
      }

      bootstrapped.current = true;
    } catch {
      // Notifications are optional; a polling failure must never affect chat.
    }
  }, [enabled, notify, pathname, user]);

  useEffect(() => {
    if (!user || !enabled) return;
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => window.clearInterval(timer);
  }, [enabled, poll, user]);

  async function enableNotifications() {
    if (!canNotify()) return;
    if (Notification.permission === "denied") {
      setPermission("denied");
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      roomCursors.current.clear();
      dmCursors.current.clear();
      bootstrapped.current = false;
      setEnabled(true);
    }
  }

  if (!user || permission === "unsupported" || permission === "denied") return null;

  return (
    <button
      type="button"
      onClick={() => void enableNotifications()}
      title={permission === "granted" ? "Chrome notifications enabled" : "Enable Chrome notifications"}
      aria-label={permission === "granted" ? "Chrome notifications enabled" : "Enable Chrome notifications"}
      className="fixed bottom-4 right-4 z-[80] flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-900/90 text-base shadow-lg backdrop-blur transition hover:border-orange-500/40 hover:bg-slate-800"
    >
      {permission === "granted" ? "🔔" : "🔕"}
    </button>
  );
}
