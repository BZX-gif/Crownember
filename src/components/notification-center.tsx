"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  BellIcon,
  CheckIcon,
  HeartIcon,
  MailIcon,
  ReplyIcon,
  UserIcon,
} from "@/components/icons";
import { Button } from "@/components/primitives";
import { cn, timeAgo, type PublicUser } from "@/lib/utils";
import type { AppNotification, NotificationType } from "@/lib/notifications";

const ALERTS_KEY = "vyron.desktop-alerts";
const ALERTS_EVENT = "vyron:desktop-alerts";
const POLL_MS = 90_000;

/** Desktop alerts are an external store (localStorage), not React state. */
function subscribeAlerts(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(ALERTS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(ALERTS_EVENT, onChange);
  };
}

function alertsSnapshot() {
  try {
    return window.localStorage.getItem(ALERTS_KEY) === "on";
  } catch {
    return false;
  }
}

function writeAlerts(on: boolean) {
  try {
    window.localStorage.setItem(ALERTS_KEY, on ? "on" : "off");
  } catch {
    /* storage can be unavailable in private modes */
  }
  window.dispatchEvent(new Event(ALERTS_EVENT));
}

const ICONS: Record<
  NotificationType,
  (p: { size?: number; className?: string }) => React.ReactElement
> = {
  reply: (p) => <ReplyIcon {...p} />,
  like: (p) => <HeartIcon {...p} />,
  friend: (p) => <UserIcon {...p} />,
  message: (p) => <MailIcon {...p} />,
};

const LABELS: Record<NotificationType, string> = {
  reply: "Reply",
  like: "Appreciation",
  friend: "Friend request",
  message: "Direct message",
};

export function NotificationBell({ user }: { user: PublicUser | null }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false);
  const alertsOn = useSyncExternalStore(
    subscribeAlerts,
    alertsSnapshot,
    () => false,
  );
  const [alertError, setAlertError] = useState("");

  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const firstLoadRef = useRef(true);
  const lastLoadRef = useRef(0);
  const alertsRef = useRef(false);

  useEffect(() => {
    alertsRef.current = alertsOn;
  }, [alertsOn]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) {
        setError("Notifications could not load.");
        return;
      }
      const data = (await res.json()) as {
        items?: AppNotification[];
        unreadCount?: number;
      };
      const next = data.items ?? [];
      setItems(next);
      setUnread(data.unreadCount ?? 0);
      setError("");
      lastLoadRef.current = Date.now();

      const unseen = next.filter((item) => item.unread && !seenRef.current.has(item.id));
      if (
        !firstLoadRef.current &&
        alertsRef.current &&
        document.visibilityState === "hidden" &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        for (const item of unseen.slice(0, 3)) {
          try {
            const notification = new Notification(item.title, {
              body: item.body,
              tag: item.id,
            });
            notification.onclick = () => {
              window.focus();
              window.location.assign(item.href);
            };
          } catch {
            /* Notification construction can fail on some platforms */
          }
        }
      }
      for (const item of next) seenRef.current.add(item.id);
      firstLoadRef.current = false;
    } catch {
      setError("Notifications could not load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const start = setTimeout(() => void load(), 700);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);

    function onVisible() {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastLoadRef.current > 60_000
      ) {
        void load();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(start);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, user]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function markAllRead() {
    if (marking || unread === 0) return;
    setMarking(true);
    try {
      const res = await fetch("/api/notifications", { method: "POST" });
      if (!res.ok) {
        setError("Could not mark notifications read.");
        return;
      }
      setItems((prev) => prev.map((item) => ({ ...item, unread: false })));
      setUnread(0);
    } catch {
      setError("Could not mark notifications read.");
    } finally {
      setMarking(false);
    }
  }

  async function toggleAlerts() {
    setAlertError("");
    if (alertsOn) {
      writeAlerts(false);
      return;
    }
    if (!("Notification" in window)) {
      setAlertError("This browser does not support desktop alerts.");
      return;
    }
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
      setAlertError("Desktop alerts are blocked in your browser settings.");
      return;
    }
    writeAlerts(true);
  }

  if (!user) return null;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-white/[0.05] hover:text-fg",
          open ? "bg-white/[0.06] text-fg" : "text-muted",
        )}
      >
        <BellIcon size={17} />
        {unread > 0 && (
          <span
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-fg ring-2 ring-ink"
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-label="Notifications"
          className="animate-fade-in fixed inset-x-4 top-[68px] z-50 max-h-[calc(100dvh-6rem)] overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-[0_24px_60px_rgba(0,0,0,0.65)] focus:outline-none sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[min(92vw,384px)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="text-[13px] font-medium text-fg">Notifications</p>
              <p className="mt-0.5 text-[11px] text-subtle">
                Replies, appreciation, requests, messages.
              </p>
            </div>
            {unread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void markAllRead()}
                loading={marking}
                className="h-7 px-2 text-[11px]"
              >
                <CheckIcon size={12} /> Mark read
              </Button>
            )}
          </div>

          <div className="nice-scroll max-h-[min(60vh,420px)] overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-3" aria-hidden="true">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex gap-3">
                    <span className="skeleton h-7 w-7 rounded-full" />
                    <span className="flex-1 space-y-1.5">
                      <span className="skeleton block h-2.5 w-3/4 rounded" />
                      <span className="skeleton block h-2 w-1/2 rounded" />
                    </span>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-muted">{error}</p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="mt-2 text-xs text-fg underline underline-offset-2"
                >
                  Try again
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-line text-subtle">
                  <BellIcon size={15} />
                </span>
                <p className="mt-3 text-xs font-medium text-fg">Nothing yet</p>
                <p className="mt-1 text-[11px] leading-relaxed text-subtle">
                  When someone replies, appreciates a post, adds you or messages
                  you, it lands here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]",
                        item.unread && "bg-white/[0.025]",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                          item.unread
                            ? "border-line-strong text-fg"
                            : "border-line text-subtle",
                        )}
                        aria-hidden="true"
                      >
                        {ICONS[item.type]({ size: 13 })}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                          <span className="min-w-0 flex-1 text-xs leading-snug text-fg">
                            {item.title}
                          </span>
                          {item.unread && (
                            <span
                              className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-fg"
                              aria-label="Unread"
                            />
                          )}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-relaxed text-muted">
                          {item.body}
                        </span>
                        <span className="mono-meta mt-1 block">
                          {LABELS[item.type]} · {timeAgo(item.createdAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-line px-4 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-subtle">Desktop alerts</span>
              <button
                type="button"
                role="switch"
                aria-checked={alertsOn}
                onClick={() => void toggleAlerts()}
                aria-label="Desktop alerts"
                className={cn(
                  "tap-target relative h-[18px] w-8 rounded-full border transition-colors",
                  alertsOn
                    ? "border-fg bg-fg"
                    : "border-line-strong bg-white/[0.04]",
                )}
              >
                <span
                  className={cn(
                    "absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full transition-[left,background-color]",
                    alertsOn ? "left-[17px] bg-ink" : "left-[2px] bg-subtle",
                  )}
                />
              </button>
            </div>
            {alertError && (
              <p className="mt-1 text-[11px] leading-relaxed text-danger">
                {alertError}
              </p>
            )}
            <p className="mt-1.5 text-[11px] leading-relaxed text-subtle">
              Only your own activity is ever shown. Nothing is invented.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
