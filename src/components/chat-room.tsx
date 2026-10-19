"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, FounderChip, RankBadge } from "@/components/ui";
import { ExpiryCountdown } from "@/components/expiry-countdown";
import { VoicePanel } from "@/components/voice-panel";
import { Button, Notice, buttonClass } from "@/components/primitives";
import {
  ArrowLeftIcon,
  ClockIcon,
  LockIcon,
  SendIcon,
  SmileIcon,
} from "@/components/icons";
import { useToast } from "@/components/toast";
import { isSticker, STICKER_SECTIONS } from "@/lib/stickers";
import { cn, type ChatMessageDTO, type PublicUser } from "@/lib/utils";

const MAX_LEN = 400;
const REACTION_OPTIONS = ["❤️", "👍", "😂", "🔥", "😮", "🙏"];

type ReactionMap = Record<string, { counts: Record<string, number>; selected: string | null }>;

interface RoomInfo {
  slug: string;
  name: string;
  description: string;
  retention: string;
  isVault: boolean;
}

function Clock({ date }: { date: Date | string }) {
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    <time dateTime={d.toISOString()} className="text-[10px] tabular-nums text-subtle">
      {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}

export function ChatRoom({
  room,
  user,
  initialMessages,
  initialReactions,
  initialOnline,
}: {
  room: RoomInfo;
  user: PublicUser | null;
  initialMessages: ChatMessageDTO[];
  initialReactions: ReactionMap;
  initialOnline: number;
}) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessageDTO[]>(initialMessages);
  const [reactions, setReactions] = useState<ReactionMap>(initialReactions);
  const [online, setOnline] = useState(initialOnline);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [silenced, setSilenced] = useState(false);
  const [paletteFor, setPaletteFor] = useState(0);
  const [pendingReaction, setPendingReaction] = useState("");
  const [stickersOpen, setStickersOpen] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastFetch = useRef(0);

  const grouped = useMemo(() => {
    return messages.map((message, index) => {
      const prev = messages[index - 1];
      const sameAuthor =
        prev &&
        prev.user.id === message.user.id &&
        new Date(message.createdAt).getTime() -
          new Date(prev.createdAt).getTime() <
          5 * 60_000;
      return { message, grouped: Boolean(sameAuthor) };
    });
  }, [messages]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // One full window per refresh. The server filters expired messages, so
  // nudging the list into agreement is the only way this room stays honest
  // about what has burned. Skipped entirely while the tab is hidden.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function sync() {
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(
            `/api/chat/messages?room=${encodeURIComponent(room.slug)}&after=0`,
            { cache: "no-store" },
          );
          if (res.ok) {
            const data = (await res.json()) as {
              messages?: ChatMessageDTO[];
              reactions?: ReactionMap;
              online?: { room?: number };
              me?: { mutedUntil?: string | null; banned?: boolean } | null;
            };
            if (!cancelled) {
              if (Array.isArray(data.messages)) setMessages(data.messages);
              if (data.reactions) setReactions(data.reactions);
              if (typeof data.online?.room === "number") setOnline(data.online.room);
              setSilenced(
                Boolean(
                  data.me?.banned ||
                    (data.me?.mutedUntil &&
                      new Date(data.me.mutedUntil).getTime() > Date.now()),
                ),
              );
              lastFetch.current = Date.now();
            }
          }
        } catch {
          /* the next tick retries */
        }
      }
      if (!cancelled) timer = setTimeout(sync, 6_000);
    }

    lastFetch.current = Date.now();
    timer = setTimeout(sync, 6_000);

    function onVisible() {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastFetch.current > 5_000
      ) {
        void sync();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [room.slug]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || busy || !user) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: room.slug, content }),
      });
      const data = (await res.json()) as {
        message?: ChatMessageDTO;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "The message could not be sent.");
        if (data.code === "MUTED" || data.code === "BANNED_PERM") setSilenced(true);
        return;
      }
      setInput("");
      stickToBottom.current = true;
      if (data.message) {
        setMessages((prev) =>
          [...prev.filter((m) => m.id !== data.message!.id), data.message!].slice(-200),
        );
      }
    } catch {
      setError("Network error — the message was not sent.");
    } finally {
      setBusy(false);
    }
  }

  async function sendSticker(sticker: string) {
    if (!user || busy) return;
    setStickersOpen(false);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: room.slug, content: sticker }),
      });
      const data = (await res.json()) as { message?: ChatMessageDTO; error?: string };
      if (!res.ok || !data.message) {
        setError(data.error ?? "The sticker could not be sent.");
        return;
      }
      stickToBottom.current = true;
      setMessages((prev) =>
        [...prev.filter((m) => m.id !== data.message!.id), data.message!].slice(-200),
      );
    } catch {
      setError("Network error — the sticker was not sent.");
    } finally {
      setBusy(false);
    }
  }

  async function react(messageId: number, emoji: string) {
    if (!user || pendingReaction) return;
    setPendingReaction(`${messageId}:${emoji}`);
    setPaletteFor(0);

    let previous: ReactionMap | undefined;
    setReactions((prev) => {
      previous = prev;
      const key = String(messageId);
      const current = prev[key] ?? { counts: {}, selected: null };
      const counts = { ...current.counts };
      let selected: string | null = current.selected;

      if (selected === emoji) {
        counts[emoji] = Math.max(0, (counts[emoji] ?? 1) - 1);
        if (counts[emoji] === 0) delete counts[emoji];
        selected = null;
      } else {
        if (selected) {
          counts[selected] = Math.max(0, (counts[selected] ?? 1) - 1);
          if (counts[selected] === 0) delete counts[selected];
        }
        counts[emoji] = (counts[emoji] ?? 0) + 1;
        selected = emoji;
      }
      return { ...prev, [key]: { counts, selected } };
    });

    try {
      const res = await fetch("/api/chat/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "react", id: messageId, room: room.slug, emoji }),
      });
      if (!res.ok) {
        if (previous) setReactions(previous);
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        toast({
          title: "Reaction not saved",
          description: data?.error ?? "Try again in a moment.",
          variant: "danger",
        });
      }
    } catch {
      if (previous) setReactions(previous);
      toast({ title: "Reaction not saved", description: "Network error.", variant: "danger" });
    } finally {
      setPendingReaction("");
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-ink">
      <header
        className="shrink-0 border-b border-line"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
          <Link
            href="/chat"
            aria-label="Back to rooms"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.05] hover:text-fg"
          >
            <ArrowLeftIcon size={17} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-medium text-fg">{room.name}</h1>
            <p className="mono-meta mt-0.5 flex items-center gap-1.5 truncate">
              {room.isVault ? <LockIcon size={9} /> : null}
              <ClockIcon size={10} /> {room.retention}
              {online > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{online} active</span>
                </>
              )}
            </p>
          </div>
          <Link href="/messages" className={buttonClass("ghost", "sm", "h-8 px-2.5")}>
            Messages
          </Link>
        </div>
      </header>

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="nice-scroll flex-1 overflow-y-auto"
        aria-live="polite"
        aria-relevant="additions"
      >
        <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-4">
          {messages.length === 0 ? (
            <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-muted">
                <SmileIcon size={18} />
              </span>
              <p className="mt-4 text-sm font-medium text-fg">This room is quiet</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
                {room.description} Messages clear after a few hours, so silence
                just means nobody has spoken recently.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {grouped.map(({ message, grouped: isGrouped }) => {
                const mine = user?.id === message.user.id;
                const state = reactions[String(message.id)];
                const chips = Object.entries(state?.counts ?? {});
                const paletteOpen = paletteFor === message.id;

                return (
                  <li key={message.id} className={cn("group flex gap-3", mine && "flex-row-reverse")}>
                    <div className={cn("shrink-0", isGrouped && "invisible")}>
                      <Link
                        href={`/players/${encodeURIComponent(message.user.username)}`}
                        aria-label={message.user.username}
                      >
                        <Avatar
                          name={message.user.username}
                          size={34}
                          dev={message.user.dev}
                        />
                      </Link>
                    </div>

                    <div className={cn("min-w-0 max-w-[85%]", mine && "text-right")}>
                      {!isGrouped && (
                        <div
                          className={cn(
                            "flex flex-wrap items-center gap-x-2 gap-y-1",
                            mine && "justify-end",
                          )}
                        >
                          <Link
                            href={`/players/${encodeURIComponent(message.user.username)}`}
                            className="text-xs font-medium text-fg hover:underline"
                          >
                            {mine ? "You" : message.user.username}
                          </Link>
                          <RankBadge rank={message.user.rank} size="xs" />
                          {message.user.founder && <FounderChip size="xs" />}
                          <Clock date={message.createdAt} />
                          <ExpiryCountdown createdAt={message.createdAt} vault={room.isVault} />
                        </div>
                      )}

                      <div
                        className={cn(
                          "mt-1 flex items-end gap-1.5",
                          mine && "flex-row-reverse",
                        )}
                      >
                        {isSticker(message.content) ? (
                          <p
                            className="select-none text-4xl leading-none"
                            aria-label={`Sticker: ${message.content}`}
                          >
                            {message.content}
                          </p>
                        ) : (
                          <p
                            className={cn(
                              "whitespace-pre-wrap break-words rounded-lg border px-3 py-2 text-[13px] leading-relaxed",
                              mine
                                ? "border-line-strong bg-white/[0.06] text-fg"
                                : "border-line bg-panel text-[#e4e4e7]",
                            )}
                          >
                            {message.content}
                          </p>
                        )}

                        {user && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setPaletteFor((current) =>
                                  current === message.id ? 0 : message.id,
                                )
                              }
                              aria-label="React to this message"
                              aria-expanded={paletteOpen}
                              className="flex h-6 w-6 items-center justify-center rounded-md text-subtle opacity-0 transition-opacity hover:bg-white/[0.06] hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
                            >
                              <SmileIcon size={13} />
                            </button>
                            {paletteOpen && (
                              <div
                                className={cn(
                                  "absolute bottom-8 z-10 flex gap-0.5 rounded-lg border border-line-strong bg-elevated p-1 shadow-lg",
                                  mine ? "right-0" : "left-0",
                                )}
                                role="menu"
                                aria-label="Reactions"
                              >
                                {REACTION_OPTIONS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => void react(message.id, emoji)}
                                    className="rounded px-1.5 py-1 text-sm transition-colors hover:bg-white/10"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {chips.length > 0 && (
                        <div
                          className={cn(
                            "mt-1.5 flex flex-wrap items-center gap-1",
                            mine && "justify-end",
                          )}
                        >
                          {chips.map(([emoji, count]) => (
                            <button
                              key={emoji}
                              type="button"
                              disabled={!user}
                              onClick={() => void react(message.id, emoji)}
                              aria-pressed={state?.selected === emoji}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] tabular-nums transition-colors",
                                state?.selected === emoji
                                  ? "border-line-strong bg-white/[0.08] text-fg"
                                  : "border-line text-muted hover:border-line-strong hover:text-fg",
                              )}
                            >
                              <span aria-hidden="true">{emoji}</span>
                              {count}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {room.isVault && user && (
        <VoicePanel isFounder={Boolean(user.founder)} myName={user.username} />
      )}

      <div
        className="shrink-0 border-t border-line bg-ink"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto w-full max-w-3xl px-3 py-2.5 sm:px-4">
          {error && (
            <Notice variant="error" className="mb-2">
              {error}
            </Notice>
          )}

          {user ? (
            <form onSubmit={send}>
              {stickersOpen && (
                <div className="nice-scroll mb-2 max-h-44 overflow-y-auto rounded-lg border border-line bg-panel p-2">
                  {STICKER_SECTIONS.map((section) => (
                    <div key={section.label} className="mb-1.5 last:mb-0">
                      <p className="px-1 pb-1 text-[9px] uppercase tracking-[0.12em] text-subtle">
                        {section.label}
                      </p>
                      <div className="flex flex-wrap gap-0.5">
                        {section.stickers.map((sticker, index) => (
                          <button
                            key={`${sticker}-${index}`}
                            type="button"
                            onClick={() => void sendSticker(sticker)}
                            aria-label={`Send ${sticker}`}
                            className="rounded-md px-1.5 py-1 text-xl transition-colors hover:bg-white/[0.06]"
                          >
                            {sticker}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => setStickersOpen((open) => !open)}
                  aria-label="Stickers"
                  aria-expanded={stickersOpen}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  <SmileIcon size={16} />
                </button>
                <label htmlFor="chat-message" className="sr-only">
                  Message {room.name}
                </label>
                <input
                  id="chat-message"
                  value={input}
                  onChange={(e) => setInput(e.target.value.slice(0, MAX_LEN))}
                  placeholder={
                    silenced ? "Your posting is paused." : `Message ${room.name}`
                  }
                  autoComplete="off"
                  disabled={silenced || busy}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 text-[13px] text-fg placeholder:text-subtle focus:border-line-strong focus:outline-none disabled:opacity-50"
                />
                <span className="hidden w-12 text-right text-[10px] tabular-nums text-subtle sm:block">
                  {input.length}/{MAX_LEN}
                </span>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!input.trim() || silenced}
                  loading={busy}
                  aria-label="Send message"
                  className="h-10 w-10 px-0"
                >
                  <SendIcon size={16} />
                </Button>
              </div>
              <p className="mt-1.5 hidden text-[10px] text-subtle sm:block">
                Messages clear {room.isVault ? "14 minutes" : "3 hours"} after
                sending. Abuse is reviewed and rate-limited.
              </p>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2.5">
              <p className="flex-1 text-xs text-muted">
                Reading as a guest. Sign in to write in this room.
              </p>
              <div className="flex gap-1.5">
                <Link href="/login" className={buttonClass("secondary", "sm", "h-8 px-3")}>
                  Sign in
                </Link>
                <Link href="/register" className={buttonClass("primary", "sm", "h-8 px-3")}>
                  Join
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
