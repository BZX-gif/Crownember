"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, DevChip, RankBadge } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { PublicUser } from "@/lib/utils";

const LINKS = [
  { href: "/chat", label: "Chat" },
  { href: "/forum", label: "Forum" },
  { href: "/players", label: "Players" },
];

interface SeatInfo {
  taken: number;
  max: number;
  left: number;
  open: boolean;
}

export function Navbar({ user }: { user: PublicUser | null }) {
  const pathname = usePathname();
  const [online, setOnline] = useState(0);
  const [seats, setSeats] = useState<SeatInfo | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const [roomsRes, accessRes] = await Promise.all([
          fetch("/api/chat/rooms", { cache: "no-store" }),
          fetch("/api/access", { cache: "no-store" }),
        ]);
        if (roomsRes.ok) {
          const data = await roomsRes.json();
          if (active) setOnline(data.online?.global ?? 0);
        }
        if (accessRes.ok) {
          const access = await accessRes.json();
          if (active) setSeats(access);
        }
      } catch {
        /* ignore */
      }
    }
    poll();
    const t = setInterval(poll, 30000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
        <Link href="/" className="group flex items-center gap-2">
          <span className="text-2xl transition-transform duration-300 group-hover:scale-125 group-hover:-rotate-12">
            👑
          </span>
          <span className="font-display text-xl uppercase tracking-wide">
            Ember<span className="text-fire">Crown</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold transition",
                pathname.startsWith(l.href)
                  ? "bg-orange-500/15 text-orange-400"
                  : "text-slate-300 hover:bg-white/5 hover:text-white",
              )}
            >
              {l.label}
            </Link>
          ))}
          <span className="ml-2 flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            {online} online
          </span>
          {seats && (
            <Link
              href="/register"
              className={cn(
                "ml-1.5 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black",
                seats.open
                  ? "border-orange-500/50 bg-orange-500/15 text-orange-400 transition hover:bg-orange-500/25"
                  : "border-slate-500/40 bg-slate-500/10 text-slate-400",
              )}
            >
              {seats.open ? (
                <>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
                  {seats.left} of {seats.max} seats left
                </>
              ) : (
                <>🔒 SOLD OUT</>
              )}
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 transition hover:bg-white/10"
              >
                <Avatar
                  name={user.username}
                  color={user.avatarColor}
                  size={30}
                  dev={user.dev}
                />
                <span className="hidden max-w-[110px] truncate text-sm font-semibold sm:block">
                  {user.username}
                </span>
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-12 w-64 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <div className="border-b border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={user.username}
                        color={user.avatarColor}
                        size={44}
                        dev={user.dev}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-bold">{user.username}</p>
                        <div className="flex flex-wrap items-center gap-1">
                          <RankBadge rank={user.rank} size="xs" />
                          {user.dev && <DevChip size="xs" />}
                        </div>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      ⭐ {user.xp.toLocaleString()} XP · Level {user.rank.level}
                    </p>
                  </div>
                  <div className="p-1.5">
                    <Link
                      href={`/players/${encodeURIComponent(user.username)}`}
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
                    >
                      👤 My Profile
                    </Link>
                    <Link
                      href="/forum/new"
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
                    >
                      ✍️ New Topic
                    </Link>
                    <button
                      onClick={logout}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-400 transition hover:bg-rose-500/10"
                    >
                      🚪 Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-sm font-bold text-slate-950 shadow-lg shadow-orange-500/25 transition hover:brightness-110"
              >
                Join Free
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile nav */}
      <div className="flex gap-1 border-t border-white/5 px-4 py-2 md:hidden">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-semibold transition",
              pathname.startsWith(l.href)
                ? "bg-orange-500/15 text-orange-400"
                : "text-slate-400 hover:bg-white/5 hover:text-white",
            )}
          >
            {l.label}
          </Link>
        ))}
        <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          {online} online
        </span>
      </div>
    </header>
  );
}
