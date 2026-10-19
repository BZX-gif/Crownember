"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar, DevChip, RankBadge } from "@/components/ui";
import { Brand } from "@/components/brand";
import { NotificationBell } from "@/components/notification-center";
import {
  ChevronDownIcon,
  FeedIcon,
  ForumIcon,
  ChatIcon,
  MailIcon,
  LogOutIcon,
  PencilIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";
import { cn, type PublicUser } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Feed", short: "Feed", Icon: FeedIcon },
  { href: "/forum", label: "Forum", short: "Forum", Icon: ForumIcon },
  { href: "/chat", label: "Rooms", short: "Rooms", Icon: ChatIcon },
  { href: "/messages", label: "Messages", short: "Inbox", Icon: MailIcon },
  { href: "/players", label: "People", short: "People", Icon: UsersIcon },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Navbar({
  user,
  pendingRequests = 0,
}: {
  user: PublicUser | null;
  pendingRequests?: number;
}) {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line bg-ink/88 backdrop-blur-xl">
        <div className="page-shell flex h-[60px] items-center justify-between gap-4">
          <Brand size={27} />

          <nav aria-label="Primary" className="hidden items-center gap-0.5 md:flex">
            {LINKS.map(({ href, label }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                    active
                      ? "bg-white/[0.06] text-fg"
                      : "text-muted hover:bg-white/[0.035] hover:text-fg",
                  )}
                >
                  {label}
                  {href === "/messages" && pendingRequests > 0 && (
                    <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-fg px-1 text-[9px] font-semibold leading-none text-ink">
                      {pendingRequests > 9 ? "9+" : pendingRequests}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5">
            <NotificationBell user={user} />

            {user ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Account menu"
                  className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 text-muted transition-colors hover:bg-white/[0.05] hover:text-fg sm:pr-2"
                >
                  <Avatar name={user.username} size={28} dev={user.dev} />
                  <span className="hidden max-w-[110px] truncate text-[13px] font-medium text-fg sm:block">
                    {user.username}
                  </span>
                  <ChevronDownIcon size={13} className="hidden sm:block" />
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    aria-label="Account"
                    className="animate-fade-in absolute right-0 top-[calc(100%+8px)] w-64 overflow-hidden rounded-xl border border-line-strong bg-[#0b0b0c] shadow-2xl shadow-black/60"
                  >
                    <div className="border-b border-line px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={user.username} size={38} dev={user.dev} decorative={false} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-fg">{user.username}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <RankBadge rank={user.rank} size="xs" />
                            {user.dev && <DevChip size="xs" />}
                          </div>
                        </div>
                      </div>
                      <p className="mono-meta mt-2.5">
                        {user.xp.toLocaleString()} XP · Level {user.rank.level}
                      </p>
                    </div>
                    <div className="p-1.5">
                      <Link
                        href={`/players/${encodeURIComponent(user.username)}`}
                        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-white/[0.05] hover:text-fg"
                        role="menuitem"
                      >
                        <UserIcon size={15} /> Profile
                      </Link>
                      <Link
                        href="/forum/new"
                        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-white/[0.05] hover:text-fg"
                        role="menuitem"
                      >
                        <PencilIcon size={15} /> New post
                      </Link>
                      <Link
                        href="/messages"
                        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-white/[0.05] hover:text-fg"
                        role="menuitem"
                      >
                        <MailIcon size={15} /> Messages
                      </Link>
                    </div>
                    <div className="border-t border-line p-1.5">
                      <button
                        type="button"
                        onClick={() => void logout()}
                        disabled={busy}
                        role="menuitem"
                        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-muted transition-colors hover:bg-white/[0.05] hover:text-fg disabled:opacity-50"
                      >
                        <LogOutIcon size={15} /> {busy ? "Signing out…" : "Sign out"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link
                  href="/login"
                  className="hidden rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-fg sm:block"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-fg px-3.5 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-white"
                >
                  Join VYRON
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile tab bar — the primary navigation on small screens. */}
      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <div className="grid grid-cols-5">
          {LINKS.map(({ href, short, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                  active ? "text-fg" : "text-subtle hover:text-muted",
                )}
              >
                <Icon size={19} />
                {short}
                {href === "/messages" && pendingRequests > 0 && (
                  <span className="absolute right-[24%] top-1.5 h-1.5 w-1.5 rounded-full bg-fg" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
