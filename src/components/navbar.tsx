"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, DevChip, RankBadge } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { PublicUser } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Feed" },
  { href: "/forum", label: "Forum" },
  { href: "/messages", label: "Messages" },
  { href: "/chat", label: "Chat" },
  { href: "/players", label: "People" },
];

interface SeatInfo { taken: number; max: number; left: number; open: boolean; }

export function Navbar({ user }: { user: PublicUser | null }) {
  const pathname = usePathname();
  const [online, setOnline] = useState(0);
  const [seats, setSeats] = useState<SeatInfo | null>(null);
  const [pending, setPending] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const [roomsRes, accessRes, meRes] = await Promise.all([
          fetch("/api/chat/rooms", { cache: "no-store" }),
          fetch("/api/access", { cache: "no-store" }),
          fetch("/api/me", { cache: "no-store" }),
        ]);
        if (roomsRes.ok) { const data = await roomsRes.json(); if (active) setOnline(data.online?.global ?? 0); }
        if (accessRes.ok) { const access = await accessRes.json(); if (active) setSeats(access); }
        if (meRes.ok) { const me = await meRes.json(); if (active) setPending(Number(me.pendingRequests ?? 0)); }
      } catch { /* ignore */ }
    }
    poll();
    const t = setInterval(poll, 30000);
    return () => { active = false; clearInterval(t); };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
        <Link href="/" className="group flex items-center gap-2" aria-label="VYRON Home">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true" className="transition-transform duration-300 group-hover:scale-110">
            <rect width="32" height="32" rx="6" fill="currentColor"/>
            <path d="M8 12h16M8 16h12M8 20h8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="26" cy="6" r="4" fill="#fff" opacity="0.15"/>
          </svg>
          <span className="font-display text-xl uppercase tracking-wide">VYRON</span>
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={cn("relative rounded-lg px-4 py-2 text-sm font-semibold transition", pathname.startsWith(l.href) ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white")}>
              {l.label}
              {l.href === "/messages" && pending > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 font-hud text-[9px] font-bold text-white">{pending}</span>}
            </Link>
          ))}
          <span className="ml-2 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/60"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40" />{online} online</span>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account menu"
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 transition hover:bg-white/10"
              >
                <Avatar name={user.username} color={user.avatarColor} size={30} dev={user.dev} />
                <span className="hidden max-w-[110px] truncate text-sm font-semibold sm:block">{user.username}</span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-12 w-64 overflow-hidden rounded-2xl border border-white/10 bg-black/95 shadow-2xl backdrop-blur"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <div className="border-b border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={user.username} color={user.avatarColor} size={44} dev={user.dev} />
                      <div className="min-w-0">
                        <p className="truncate font-bold">{user.username}</p>
                        <div className="flex flex-wrap items-center gap-1">
                          <RankBadge rank={user.rank} size="xs" />
                          {user.dev && <DevChip size="xs" />}
                        </div>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-white/50">⭐ {user.xp.toLocaleString()} XP · Level {user.rank.level}</p>
                  </div>
                  <div className="p-1.5">
                    <Link href={`/players/${encodeURIComponent(user.username)}`} onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white">👤 My Profile</Link>
                    <Link href="/forum/new" onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white">✍️ New Post</Link>
                    <button onClick={logout} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white">🚪 Log out</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/5 hover:text-white">Log in</Link>
              <Link href="/register" className="vyron-btn bg-white text-black px-4 py-2 text-sm font-bold uppercase tracking-widest transition hover:brightness-110">Join Free</Link>
            </>
          )}
        </div>
      </div>
      <div className="flex gap-1 border-t border-white/5 px-4 py-2 md:hidden">
        {LINKS.map((l) => <Link key={l.href} href={l.href} className={cn("relative rounded-lg px-3 py-1.5 text-sm font-semibold transition sm:px-4", pathname.startsWith(l.href) ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white")}>{l.label}{l.href === "/messages" && pending > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 font-hud text-[9px] font-bold text-white">{pending}</span>}</Link>)}
        <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-white/50"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/30" />{online} online</span>
      </div>
    </header>
  );
}