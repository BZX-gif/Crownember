"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, DevChip, RankBadge } from "@/components/ui";
import { NotificationBell } from "@/components/notification-bell";
import { LogoutIcon, PenIcon, UserIcon, Wordmark } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { PublicUser } from "@/lib/utils";

const LINKS = [
  { href: "/forum", label: "Feed" },
  { href: "/chat", label: "Rooms" },
  { href: "/messages", label: "Messages" },
  { href: "/players", label: "Members" },
];

export function Navbar({ user }: { user: PublicUser | null }) {
  const pathname = usePathname();
  const [pending, setPending] = useState(0);
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    async function poll() {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (res.ok) {
          const me = await res.json();
          if (active) {
            setPending(Number(me.pendingRequests ?? 0));
            setUnread(Number(me.unreadNotifications ?? 0));
          }
        }
      } catch {
        /* badges simply stay as they are */
      }
    }
    poll();
    const t = setInterval(poll, 30000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [user]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#050505]/85 backdrop-blur-md">
      <div className="mx-auto flex h-[60px] max-w-6xl items-center justify-between gap-3 px-4">
        <Link
          href="/"
          aria-label="VYRON — home"
          className="transition-opacity hover:opacity-80"
        >
          <Wordmark />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "relative rounded-full px-4 py-2 text-sm font-medium transition",
                pathname.startsWith(l.href)
                  ? "bg-white/10 text-white"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white",
              )}
            >
              {l.label}
              {l.href === "/messages" && pending > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-100 px-1 font-hud text-[9px] font-bold text-black">
                  {pending}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <NotificationBell user={user} unreadCount={unread} />
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Account menu"
                  className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-3 transition hover:border-white/25 hover:bg-white/10"
                >
                  <Avatar
                    name={user.username}
                    color={user.avatarColor}
                    size={30}
                    dev={user.dev}
                  />
                  <span className="hidden max-w-[110px] truncate text-sm font-medium sm:block">
                    {user.username}
                  </span>
                </button>
                {menuOpen && (
                  <div
                    role="menu"
                    className="animate-pop-in absolute right-0 top-12 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl"
                    onMouseLeave={() => setMenuOpen(false)}
                  >
                    <div className="border-b border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={user.username}
                          color={user.avatarColor}
                          size={44}
                          dev={user.dev}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-white">
                            {user.username}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <RankBadge rank={user.rank} size="xs" />
                            {user.dev && <DevChip size="xs" />}
                          </div>
                        </div>
                      </div>
                      <p className="mt-2.5 font-hud text-[10px] uppercase tracking-widest text-zinc-500">
                        {user.xp.toLocaleString()} XP · Level {user.rank.level}
                      </p>
                    </div>
                    <div className="p-1.5">
                      <Link
                        href={`/players/${encodeURIComponent(user.username)}`}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
                      >
                        <UserIcon className="h-4 w-4" /> My profile
                      </Link>
                      <Link
                        href="/forum/new"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
                      >
                        <PenIcon className="h-4 w-4" /> New post
                      </Link>
                      <button
                        onClick={logout}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-rose-300/90 transition hover:bg-rose-500/10"
                      >
                        <LogoutIcon className="h-4 w-4" /> Log out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-semibold text-black transition hover:bg-white"
              >
                Join VYRON
              </Link>
            </>
          )}
        </div>
      </div>
      <div className="flex gap-1 border-t border-white/[0.05] px-4 py-2 md:hidden">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "relative rounded-full px-3 py-1.5 text-sm font-medium transition sm:px-4",
              pathname.startsWith(l.href)
                ? "bg-white/10 text-white"
                : "text-zinc-400 hover:bg-white/5 hover:text-white",
            )}
          >
            {l.label}
            {l.href === "/messages" && pending > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-100 px-1 font-hud text-[9px] font-bold text-black">
                {pending}
              </span>
            )}
          </Link>
        ))}
      </div>
    </header>
  );
}
