"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, FounderChip, RankBadge } from "@/components/ui";
import { DevMessage } from "@/components/dev-message";
import { ExpiryCountdown } from "@/components/expiry-countdown";
import { VoicePanel } from "@/components/voice-panel";
import { isSticker, STICKER_PACK } from "@/lib/stickers";
import { cn } from "@/lib/utils";
import type { ChatMessageDTO, PublicUser } from "@/lib/utils";

const QUICK_EMOJI = ["🔥", "😂", "💀", "😎", "👍", "❤️", "💯", "🐐", "🙏", "🏆"];
const MAX_LEN = 400;

interface AbuseAlert {
  code: "STRIKE_1" | "STRIKE_2" | "MUTED" | "BANNED_PERM";
  message: string;
  mutedUntil?: string;
}

function MuteCountdown({
  until,
  onExpire,
}: {
  until: string;
  onExpire: () => void;
}) {
  const [left, setLeft] = useState(() =>
    Math.max(0, new Date(until).getTime() - Date.now()),
  );
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, new Date(until).getTime() - Date.now());
      setLeft(l);
      if (l <= 0) {
        clearInterval(t);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [until, onExpire]);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return (
    <span className="font-hud text-2xl font-bold tracking-widest text-rose-300">
      {h > 0 ? `${h}h ` : ""}
      {String(m).padStart(2, "0")}m {String(s).padStart(2, "0")}s
    </span>
  );
}

function AbusePanel({
  abuse,
  onExpire,
  onDismiss,
}: {
  abuse: AbuseAlert;
  onExpire: () => void;
  onDismiss: () => void;
}) {
  if (abuse.code === "BANNED_PERM") {
    return (
      <div className="border-y-2 border-rose-500 bg-black px-4 py-6 text-center">
        <p className="text-4xl">☠️</p>
        <p className="mt-2 font-display text-lg uppercase tracking-wide text-rose-500">
          Permanently exiled
        </p>
        <p className="mt-1 text-sm text-slate-400">{abuse.message}</p>
        <p className="mt-2 font-hud text-[11px] uppercase tracking-widest text-slate-600">
          disconnecting you from the arena…
        </p>
      </div>
    );
  }
  if (abuse.code === "MUTED") {
    return (
      <div className="border-y-2 border-rose-500/60 bg-rose-950/40 px-4 py-5 text-center">
        <p className="animate-pulse text-3xl">🔨</p>
        <p className="mt-1.5 font-display text-base uppercase tracking-wide text-rose-400">
          The power of darkness holds you
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Banned from messaging. Your sentence ends in
        </p>
        <div className="mt-2">
          {abuse.mutedUntil && (
            <MuteCountdown until={abuse.mutedUntil} onExpire={onExpire} />
          )}
        </div>
      </div>
    );
  }
  const first = abuse.code === "STRIKE_1";
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-y px-4 py-3",
        first
          ? "border-amber-400/40 bg-amber-500/10"
          : "border-orange-500/50 bg-orange-500/10",
      )}
    >
      <span className={cn("text-2xl", !first && "animate-pulse")}>
        {first ? "👁" : "⚠️"}
      </span>
      <p
        className={cn(
          "flex-1 text-sm font-semibold",
          first ? "text-amber-300" : "text-orange-300",
        )}
      >
        {abuse.message}
      </p>
      <button
        onClick={onDismiss}
        className="font-hud text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300"
      >
        understood
      </button>
    </div>
  );
}

interface RoomInfo {
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export function ChatRoom({
  room,
  user,
  vault = false,
  vaultIsFounder = false,
}: {
  room: RoomInfo;
  user: PublicUser | null;
  vault?: boolean;
  vaultIsFounder?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [online, setOnline] = useState({ global: 0, room: 0 });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [abuse, setAbuse] = useState<AbuseAlert | null>(null);
  const [iAmDev, setIAmDev] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);

  const silenceExpired = useCallback(() => setAbuse(null), []);

  async function claimDevFlairClick() {
    try {
      const res = await fetch("/api/dev/claim", { method: "POST" });
      const d = await res.json();
      if (res.ok && d.dev) {
        setIAmDev(true);
      } else {
        setError(d.error ?? "The Developer Crown is already claimed.");
      }
    } catch {
      setError("Network error — try again.");
    }
  }
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);
  const lastIdRef = useRef(0);

  const poll = useCallback(async () => {
    try {
      // The vault re-syncs the full window every poll (low traffic, max
      // reliability): burned messages vanish exactly when the server says so.
      const after = vault ? 0 : lastIdRef.current;
      const res = await fetch(
        `/api/chat/messages?room=${encodeURIComponent(room.slug)}&after=${after}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = await res.json();
      // Silent burn: messages flagged as abusive vanish from the room
      // without any error or trace.
      if (Array.isArray(data.purgedIds) && data.purgedIds.length > 0) {
        const burned = new Set(data.purgedIds as number[]);
        setMessages((prev) => prev.filter((m) => !burned.has(m.id)));
      }
      if (vault) {
        if (Array.isArray(data.messages)) {
          setMessages((data.messages as ChatMessageDTO[]).slice(-200));
        }
      } else if (Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = (data.messages as ChatMessageDTO[]).filter(
            (m) => !seen.has(m.id),
          );
          return [...prev, ...fresh].slice(-200);
        });
      }
      if (Array.isArray(data.messages) && data.messages.length > 0) {
        lastIdRef.current = Math.max(
          lastIdRef.current,
          ...(data.messages as ChatMessageDTO[]).map((m: ChatMessageDTO) => m.id),
        );
      }
      setOnline(data.online ?? { global: 0, room: 0 });
      // Restore judgement state after a refresh
      if (data.me?.dev) setIAmDev(true);
      if (data.me?.banned) {
        setAbuse({ code: "BANNED_PERM", message: "Exiled from EMBERCROWN." });
      } else if (
        data.me?.mutedUntil &&
        new Date(data.me.mutedUntil).getTime() > Date.now()
      ) {
        setAbuse((prev) =>
          prev?.code === "BANNED_PERM"
            ? prev
            : {
                code: "MUTED",
                message: "Banned from messaging.",
                mutedUntil: data.me.mutedUntil,
              },
        );
      }
      setLoaded(true);
    } catch {
      /* network hiccup — next poll retries */
    }
  }, [room.slug, vault]);

  // Permanent exile → log out and throw them to the gates.
  useEffect(() => {
    if (abuse?.code !== "BANNED_PERM") return;
    const t = setTimeout(async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        /* ignore */
      }
      window.location.href = "/";
    }, 3500);
    return () => clearTimeout(t);
  }, [abuse]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [poll]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  }

  async function sendContent(content: string) {
    if (!content || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: room.slug, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code) {
          // The Judgement System has spoken
          setAbuse({
            code: data.code,
            message: data.error ?? "",
            mutedUntil: data.mutedUntil,
          });
        } else {
          setError(data.error ?? "Failed to send message.");
        }
        return;
      }
      setAbuse(null);
      setInput("");
      stickToBottom.current = true;
      if (data.message) {
        const msg = data.message as ChatMessageDTO;
        setMessages((prev) =>
          [...prev.filter((m) => m.id !== msg.id), msg].slice(-200),
        );
        lastIdRef.current = Math.max(lastIdRef.current, msg.id);
      }
      poll();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void sendContent(input.trim());
  }

  function addEmoji(emoji: string) {
    setInput((prev) => (prev.length + emoji.length <= MAX_LEN ? prev + emoji : prev));
    inputRef.current?.focus();
  }

  return (
    <section className="flex h-[100dvh] flex-col overflow-hidden bg-slate-900/60">
      {/* Room header */}
      <div
        className="flex items-center gap-2.5 border-b border-white/10 bg-slate-900/90 px-3 sm:gap-3 sm:px-4"
        style={{ paddingTop: "calc(0.625rem + env(safe-area-inset-top, 0px))", paddingBottom: "0.625rem" }}
      >
        <Link
          href="/chat"
          title="Back to inbox"
          className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          ←
        </Link>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
          style={{ backgroundColor: `${room.color}1f` }}
        >
          {room.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg uppercase tracking-wide">
            {room.name}
          </h1>
          <p className="truncate text-xs text-slate-400">{room.description}</p>
        </div>
        <span className="clip-tag hidden bg-orange-500/15 px-2.5 py-1 font-hud text-[10px] font-bold text-orange-400 sm:block">
          TTL 3H
        </span>
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          {online.room} here
        </div>
      </div>

      {/* Ephemeral notice */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-amber-500/5 px-4 py-1.5">
        <span className="text-xs">{vault ? "🔐" : "⏳"}</span>
        <p className="font-hud text-[10px] font-bold uppercase tracking-[0.15em] text-amber-400/80">
          {vault ? (
            <>
              sealed · messages burn 14 min after send · voice dies on exit
            </>
          ) : (
            <>
              Messages self-destruct 3h after sending — forever-worthy talk
              goes in the{" "}
              <a
                href="/forum"
                className="underline decoration-dotted underline-offset-2 hover:text-amber-300"
              >
                forum
              </a>
            </>
          )}
        </p>
        <span
          className="ml-auto hidden shrink-0 font-hud text-[10px] font-bold tracking-widest text-slate-600 sm:block"
          title="Abuse policy: surveillance → final warning → 2h ban → permanent exile"
        >
          👁 → ⚠️ → 🔨 → ☠️
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="nice-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4"
      >
        {!loaded && (
          <p className="pt-8 text-center text-sm text-slate-500">
            Connecting to the lobby… 🔥
          </p>
        )}
        {loaded && messages.length === 0 && (
          <div className="pt-8 text-center">
            <p className="text-4xl">🍗</p>
            <p className="mt-2 text-sm text-slate-400">
              No messages yet. Be the first to say hi!
            </p>
          </div>
        )}
        {messages.map((m) => {
          const mine = user?.id === m.user.id;
          if (isSticker(m.content)) {
            return (
              <div key={m.id} className="sticker-drop flex flex-col">
                <p
                  className="w-fit select-none text-6xl leading-none"
                  style={{ filter: "drop-shadow(0 6px 18px rgba(255,106,0,0.22))" }}
                >
                  {m.content}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/players/${encodeURIComponent(m.user.username)}`}
                    className={cn(
                      "text-[11px] font-bold hover:underline",
                      mine ? "text-orange-400" : "text-slate-400",
                    )}
                  >
                    {m.user.username}
                  </Link>
                  <ExpiryCountdown createdAt={m.createdAt} vault={vault} />
                </div>
              </div>
            );
          }
          if (m.user.dev) {
            return <DevMessage key={m.id} msg={m} vault={vault} />;
          }
          return (
            <div key={m.id} className="group flex gap-3">
              <Link href={`/players/${encodeURIComponent(m.user.username)}`}>
                <Avatar
                  name={m.user.username}
                  color={m.user.avatarColor}
                  size={36}
                  dev={m.user.dev}
                />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Link
                    href={`/players/${encodeURIComponent(m.user.username)}`}
                    className={cn(
                      "text-sm font-bold hover:underline",
                      mine ? "text-orange-400" : "text-slate-200",
                    )}
                  >
                    {m.user.username}
                  </Link>
                  <RankBadge rank={m.user.rank} size="xs" />
                  {m.user.founder && <FounderChip size="xs" />}
                  <ExpiryCountdown createdAt={m.createdAt} vault={vault} />
                </div>
                <p
                  className={cn(
                    "mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed",
                    mine ? "text-orange-50" : "text-slate-100",
                  )}
                >
                  {m.content}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* The Judgement System */}
      {abuse && (
        <AbusePanel
          abuse={abuse}
          onExpire={silenceExpired}
          onDismiss={silenceExpired}
        />
      )}

      {/* Vault voice deck */}
      {vault && user && (
        <VoicePanel isFounder={vaultIsFounder} myName={user.username} />
      )}

      {/* Composer */}
      {user ? (
        <form
          onSubmit={submit}
          className="border-t border-white/10 bg-slate-900/90 p-2.5 sm:p-3"
          style={{
            paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          {user.founder && (
            <div className="mb-2 flex items-center gap-2">
              {iAmDev ? (
                <span className="dev-chip clip-tag px-2.5 py-1 font-hud text-[9px] font-black uppercase tracking-[0.18em] text-slate-950">
                  ⚡ dev flair active — your messages ship signed
                </span>
              ) : (
                <button
                  type="button"
                  onClick={claimDevFlairClick}
                  className="border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-hud text-[9px] font-bold uppercase tracking-[0.15em] text-amber-300 transition hover:bg-amber-500/20"
                >
                  ⚡ claim developer flair
                </button>
              )}
            </div>
          )}
          {stickerOpen && (
            <div className="mb-2 grid grid-cols-8 gap-0.5 rounded-xl border border-white/10 bg-slate-950/80 p-2 sm:gap-1">
              {STICKER_PACK.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setStickerOpen(false);
                    void sendContent(s);
                  }}
                  className="rounded-lg p-1 text-2xl transition duration-150 hover:scale-125 hover:bg-white/10 sm:text-3xl"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="mb-2 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setStickerOpen((o) => !o)}
              title="Stickers"
              className={cn(
                "rounded-lg border px-2 py-0.5 text-sm transition",
                stickerOpen
                  ? "border-orange-500/50 bg-orange-500/15"
                  : "border-white/5 bg-white/5 hover:bg-white/15",
              )}
            >
              🤩
            </button>
            {!vault &&
              QUICK_EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => addEmoji(e)}
                  className="rounded-lg border border-white/5 bg-white/5 px-2 py-0.5 text-sm transition hover:bg-white/15"
                >
                  {e}
                </button>
              ))}
            <span className="ml-auto self-center font-hud text-[10px] text-slate-500">
              {input.length}/{MAX_LEN}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_LEN))}
              placeholder={
                abuse && (abuse.code === "MUTED" || abuse.code === "BANNED_PERM")
                  ? "You are silenced…"
                  : `Message #${room.name.toLowerCase()}…`
              }
              disabled={
                abuse !== null &&
                (abuse.code === "MUTED" || abuse.code === "BANNED_PERM")
              }
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-base text-white placeholder:text-slate-600 focus:border-orange-500/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="clip-btn bg-gradient-to-r from-orange-500 to-amber-400 px-6 py-2.5 font-display text-xs uppercase tracking-widest text-slate-950 transition hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? "…" : "Fire →"}
            </button>
          </div>
          {error && (
            <p className="mt-2 text-xs font-semibold text-rose-400">{error}</p>
          )}
        </form>
      ) : (
        <div className="border-t border-white/10 bg-slate-900/90 p-4">
          <div className="flex flex-col items-center gap-2 rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 text-center sm:flex-row sm:text-left">
            <span className="text-2xl">🔒</span>
            <p className="flex-1 text-sm text-slate-300">
              <span className="font-bold text-white">Log in to join the chat.</span>{" "}
              Earn XP for every message and climb the ranks.
            </p>
            <div className="flex gap-2">
              <Link
                href="/login"
                className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-sm font-black text-slate-950 transition hover:brightness-110"
              >
                Join Free
              </Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
