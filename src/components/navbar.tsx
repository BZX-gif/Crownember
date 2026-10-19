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
  LockIcon,
  MailIcon,
  LogOutIcon,
  PencilIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";
import { avatarUrlFor, cn, type PublicUser } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Feed", short: "Feed", Icon: FeedIcon },
  { href: "/forum", label: "Forum", short: "Forum", Icon: ForumIcon },
  { href: "/chat", label: "Rooms", short: "Rooms", Icon: ChatIcon },
  { href: "/groups", label: "Groups", short: "Groups", Icon: LockIcon },
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
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    menuPanelRef.current?.focus();
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
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5">
            <NotificationBell user={user} />

            {user ? (
              <div className="relative" ref={menuRef}>
                <button
                  ref={menuButtonRef}
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  aria-label={
                    pendingRequests > 0
                      ? `${user.username} account menu, ${pendingRequests} pending friend ${pendingRequests === 1 ? "request" : "requests"}`
                      : `${user.username} account menu`
                  }
                  className="relative flex items-center gap-2 rounded-lg py-0.5 pl-1 pr-1.5 text-muted transition-colors hover:bg-white/[0.05] hover:text-fg sm:pr-2"
                >
                  <Avatar name={user.username} size={28} dev={user.dev} avatarUrl={avatarUrlFor(user)} />
                  <span className="hidden max-w-[110px] truncate text-[13px] font-medium text-fg sm:block">
                    {user.username}
                  </span>
                  <ChevronDownIcon size={13} className="hidden sm:block" />
                  {pendingRequests > 0 && (
                    <span className="absolute left-[22px] top-0 h-1.5 w-1.5 rounded-full bg-fg ring-2 ring-ink" />
                  )}
                </button>

                {menuOpen && (
                  <div
                    ref={menuPanelRef}
                    tabIndex={-1}
                    role="dialog"
                    aria-label="Account menu"
                    className="animate-fade-in absolute right-0 top-[calc(100%+8px)] w-64 overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-[0_24px_60px_rgba(0,0,0,0.65)] focus:outline-none"
                  >
                    <div className="border-b border-line px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={user.username} size={38} dev={user.dev} decorative={false} avatarUrl={avatarUrlFor(user)} />
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
                    <nav aria-label="Account" className="p-1.5">
                      <Link
                        href={`/players/${encodeURIComponent(user.username)}`}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-white/[0.05] hover:text-fg"
                      >
                        <UserIcon size={15} /> Profile
                      </Link>
                      <Link
                        href="/forum/new"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-white/[0.05] hover:text-fg"
                      >
                        <PencilIcon size={15} /> New post
                      </Link>
                      <Link
                        href="/groups"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-white/[0.05] hover:text-fg"
                      >
                        <LockIcon size={15} /> Groups
                      </Link>
                      <Link
                        href="/messages"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-white/[0.05] hover:text-fg"
                      >
                        <MailIcon size={15} /> Messages
                        {pendingRequests > 0 && (
                          <span className="ml-auto rounded-full border border-line-strong px-1.5 py-0.5 text-[11px] font-medium text-fg">
                            {pendingRequests} pending
                          </span>
                        )}
                      </Link>
                    </nav>
                    <div className="border-t border-line p-1.5">
                      <button
                        type="button"
                        onClick={() => void logout()}
                        disabled={busy}
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
                {pathname !== "/login" && (
                  <Link
                    href="/login"
                    className="hidden rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-fg sm:block"
                  >
                    Sign in
                  </Link>
                )}
                {pathname !== "/register" && (
                  <Link
                    href="/register"
                    className="rounded-lg bg-fg px-3.5 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-white"
                  >
                    Join VYRON
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile tab bar — the primary navigation on small screens. */}
      <nav
        aria-label="Primary mobile"
        data-mobile-tabbar
        className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        {/* Six destinations: the tab bar stays a grid so each target keeps a
            comfortable width on a 360px phone. */}
        <div className="grid grid-cols-6">
          {LINKS.map(({ href, short, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[56px] flex-col items-center justify-center gap-1 pb-2.5 pt-2 text-[11px] font-medium leading-none tracking-[0.01em] transition-colors",
                  active ? "text-fg" : "text-subtle hover:text-muted",
                )}
              >
                <Icon size={20} />
                {short}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-[30%] top-0 h-px rounded-full transition-colors",
                    active ? "bg-fg" : "bg-transparent",
                  )}
                />
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
