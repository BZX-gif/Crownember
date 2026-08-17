"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface RoomSummary {
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  online: number;
  locked?: boolean;
}

export function RoomsSidebar({
  rooms,
  activeSlug,
  globalOnline,
}: {
  rooms: RoomSummary[];
  activeSlug: string;
  globalOnline: number;
}) {
  const [data, setData] = useState<{ rooms: RoomSummary[]; online: { global: number } }>({
    rooms,
    online: { global: globalOnline },
  });

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch("/api/chat/rooms", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (active) setData(json);
      } catch {
        /* ignore */
      }
    }
    const t = setInterval(poll, 20000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  return (
    <aside className="rounded-2xl border border-white/10 bg-slate-900/60 p-3 lg:sticky lg:top-24">
      <div className="mb-3 flex items-center justify-between px-2 pt-1">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Chat Rooms
        </p>
        <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          {data.online.global} LIVE
        </span>
      </div>
      <div className="space-y-1">
        {data.rooms.map((room) => {
          const active = room.slug === activeSlug;
          return (
            <Link
              key={room.slug}
              href={`/chat/${room.slug}`}
              className={cn(
                "group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition",
                active
                  ? "border-orange-500/40 bg-gradient-to-r from-orange-500/15 to-amber-500/5"
                  : "border-transparent hover:border-white/10 hover:bg-white/5",
              )}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg"
                style={{ backgroundColor: `${room.color}1f` }}
              >
                {room.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm font-bold",
                    active ? "text-orange-400" : "text-slate-200 group-hover:text-white",
                  )}
                >
                  {room.name}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {room.locked
                    ? "🔒 passcode required"
                    : room.online > 0
                      ? `${room.online} player${room.online === 1 ? "" : "s"} here`
                      : "quiet right now"}
                </span>
              </span>
              {room.locked ? (
                <span className="shrink-0 text-xs">🔐</span>
              ) : (
                room.online > 0 && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                )
              )}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
