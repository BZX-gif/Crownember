"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, DevChip, FounderChip, RankBadge } from "@/components/ui";
import { ExpiryCountdown } from "@/components/expiry-countdown";
import { cn, type PublicUser } from "@/lib/utils";

interface DmMessage {
  id: number;
  content: string;
  createdAt: string;
  mine: boolean;
  editable?: boolean;
}

const MAX_LEN = 400;
const EDIT_WINDOW_MS = 3 * 60 * 1000;
const REACTIONS = ["❤️", "😂", "🔥", "😭", "👍"];

export function DmThread({ me, other, sealed }: { me: PublicUser; other: PublicUser; sealed: boolean }) {
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [abuse, setAbuse] = useState<{ code: string; message: string } | null>(null);
  const [connLost, setConnLost] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<DmMessage | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<number | null>(null);
  const [reactionPickerId, setReactionPickerId] = useState<number | null>(null);
  const [reactions, setReactions] = useState<Record<number, string>>({});
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastIdRef = useRef(0);
  const stickRef = useRef(true);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/dm/messages?with=${encodeURIComponent(other.username)}&after=${lastIdRef.current}`, { cache: "no-store" });
      if (!res.ok) { setConnLost(true); return; }
      const data = await res.json();
      setConnLost(false);
      if (data.sealed) return;
      const incoming = (data.messages ?? []) as DmMessage[];
      if (incoming.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...incoming.filter((m) => !seen.has(m.id))].slice(-200);
        });
        lastIdRef.current = Math.max(lastIdRef.current, ...incoming.map((m) => m.id));
      }
    } catch { setConnLost(true); }
  }, [other.username]);

  useEffect(() => {
    if (sealed) return;
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [poll, sealed]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  }

  function startReply(message: DmMessage) {
    setActiveMessageId(null);
    setReactionPickerId(null);
    setEditingId(null);
    setReplyingTo(message);
    setInput("");
    inputRef.current?.focus();
  }

  function startEdit(message: DmMessage) {
    if (!message.mine || Date.now() - new Date(message.createdAt).getTime() >= EDIT_WINDOW_MS) return;
    setActiveMessageId(null);
    setReactionPickerId(null);
    setReplyingTo(null);
    setEditingId(message.id);
    setInput(message.content.slice(0, MAX_LEN));
    inputRef.current?.focus();
  }

  function cancelAction() {
    setEditingId(null);
    setReplyingTo(null);
    setInput("");
    inputRef.current?.focus();
  }

  function openActions(message: DmMessage) {
    setActiveMessageId((id) => id === message.id ? null : message.id);
    setReactionPickerId(null);
  }

  function beginLongPress(message: DmMessage) {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => openActions(message), 450);
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function chooseReaction(message: DmMessage, reaction: string) {
    setReactions((prev) => ({ ...prev, [message.id]: reaction }));
    setReactionPickerId(null);
    setActiveMessageId(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || busy) return;
    setBusy(true);
    setError("");
    try {
      if (editingId !== null) {
        const res = await fetch("/api/dm/messages", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId, content }) });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? "Could not edit."); return; }
        const updated = data.message as DmMessage;
        setMessages((prev) => prev.map((m) => m.id === updated.id ? updated : m));
        setEditingId(null);
        setInput("");
        return;
      }

      const replyPrefix = replyingTo ? `↪ @${replyingTo.mine ? me.username : other.username}: "${replyingTo.content.slice(0, 180)}"\n` : "";
      const finalContent = `${replyPrefix}${content}`.slice(0, MAX_LEN);
      const res = await fetch("/api/dm/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: other.username, content: finalContent }) });
      const data = await res.json();
      if (!res.ok) {
        if (data.code) setAbuse({ code: data.code, message: data.error ?? "" });
        else setError(data.error ?? "Could not send.");
        return;
      }
      setAbuse(null);
      setReplyingTo(null);
      setInput("");
      stickRef.current = true;
      if (data.message) {
        const msg = data.message as DmMessage;
        setMessages((prev) => [...prev.filter((m) => m.id !== msg.id), msg].slice(-200));
        lastIdRef.current = Math.max(lastIdRef.current, msg.id);
      }
    } catch { setError("Network error — try again."); }
    finally { setBusy(false); inputRef.current?.focus(); }
  }

  if (sealed) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <span className="text-5xl">🔒</span>
        <h1 className="mt-4 font-display text-2xl uppercase tracking-wide text-white">Channel <span className="text-fire">sealed</span></h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">A block seal sits between you two. No messages can cross it — lift the seal from their profile to open this channel again.</p>
        <Link href={`/players/${encodeURIComponent(other.username)}`} className="clip-btn mt-6 bg-white/10 px-6 py-3 font-display text-xs uppercase tracking-widest text-white transition hover:bg-white/20">view profile</Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-900/40">
      <div className="flex items-center gap-2.5 border-b border-white/10 bg-slate-900/90 px-3 sm:gap-3 sm:px-4" style={{ paddingTop: "calc(0.625rem + env(safe-area-inset-top, 0px))", paddingBottom: "0.625rem" }}>
        <Link href="/messages" title="Back to DMs" className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-slate-400 transition hover:bg-white/10 hover:text-white">←</Link>
        <Link href={`/players/${encodeURIComponent(other.username)}`} className="flex min-w-0 items-center gap-2.5">
          <Avatar name={other.username} color={other.avatarColor} size={38} dev={other.dev} />
          <span className="min-w-0"><span className="flex items-center gap-2"><span className="truncate font-display text-base uppercase tracking-wide text-white">{other.username}</span>{other.dev && <DevChip size="xs" />}{other.founder && <FounderChip size="xs" />}</span><span className="mt-0.5 block"><RankBadge rank={other.rank} size="xs" /></span></span>
        </Link>
        <span className="ml-auto hidden shrink-0 font-hud text-[10px] uppercase tracking-wider text-slate-500 sm:block">⏳ burns after 3h</span>
      </div>

      <div ref={scrollerRef} onScroll={onScroll} className="nice-scroll flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-6">
        {messages.length === 0 && <div className="pt-10 text-center"><p className="text-3xl">✉️</p><p className="mt-2 font-hud text-xs uppercase tracking-wider text-slate-500">Private line open — say something. It burns in 3h.</p></div>}
        {messages.map((m) => {
          const canEdit = m.mine && Date.now() - new Date(m.createdAt).getTime() < EDIT_WINDOW_MS;
          const active = activeMessageId === m.id;
          return (
            <div key={m.id} className={cn("group flex", m.mine ? "justify-end" : "justify-start")}>
              <div className="relative max-w-[80%] sm:max-w-[65%]">
                {active && (
                  <div className={cn("absolute bottom-full z-20 mb-2 flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur", m.mine ? "right-0" : "left-0")}>
                    <button type="button" onClick={() => setReactionPickerId((id) => id === m.id ? null : m.id)} className="rounded-lg px-2.5 py-2 text-xs font-bold text-white hover:bg-white/10">❤️ React</button>
                    <button type="button" onClick={() => startReply(m)} className="rounded-lg px-2.5 py-2 text-xs font-bold text-white hover:bg-white/10">↩ Reply</button>
                    {canEdit && <button type="button" onClick={() => startEdit(m)} className="rounded-lg px-2.5 py-2 text-xs font-bold text-white hover:bg-white/10">✏️ Edit</button>}
                  </div>
                )}
                {reactionPickerId === m.id && (
                  <div className={cn("absolute bottom-full z-30 mb-12 flex gap-1 rounded-full border border-white/10 bg-slate-950/95 p-1.5 shadow-2xl", m.mine ? "right-0" : "left-0")}>
                    {REACTIONS.map((reaction) => <button key={reaction} type="button" onClick={() => chooseReaction(m, reaction)} className="rounded-full px-2 py-1 text-lg hover:bg-white/10">{reaction}</button>)}
                  </div>
                )}
                <div
                  onClick={() => openActions(m)}
                  onContextMenu={(e) => { e.preventDefault(); openActions(m); }}
                  onTouchStart={() => beginLongPress(m)}
                  onTouchEnd={cancelLongPress}
                  onTouchCancel={cancelLongPress}
                  className={cn("clip-tag cursor-pointer select-none px-3.5 py-2.5", m.mine ? "bg-gradient-to-br from-orange-500 to-amber-500 text-slate-950" : "border border-white/10 bg-slate-800/90 text-slate-100")}
                >
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.content}</p>
                  <div className={cn("mt-1 flex items-center justify-end gap-2", m.mine ? "text-slate-900/60" : "text-slate-500")}>
                    {reactions[m.id] && <span title="Reaction" className="text-sm">{reactions[m.id]}</span>}
                    <ExpiryCountdown createdAt={m.createdAt} vault={false} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {connLost && <div className="flex items-center gap-2 border-t border-amber-500/40 bg-amber-950/40 px-4 py-2"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" /><p className="flex-1 font-hud text-[10px] font-bold uppercase tracking-wider text-amber-300">📡 the line wobbled — retrying…</p><button onClick={() => void poll()} className="border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-hud text-[10px] font-bold uppercase text-amber-300 transition hover:bg-amber-500/20">retry now</button></div>}
      {abuse && <div className="border-t border-rose-500/40 bg-rose-950/50 px-4 py-2.5 text-xs font-semibold text-rose-300">{abuse.message}</div>}
      {error && <div className="border-t border-rose-500/40 bg-rose-950/50 px-4 py-2.5 text-xs font-semibold text-rose-300">{error}</div>}

      {(editingId !== null || replyingTo) && <div className="flex items-center gap-2 border-t border-orange-500/20 bg-orange-950/20 px-3 py-2"><span className="font-hud text-[10px] font-bold uppercase tracking-wider text-orange-300">{editingId !== null ? "editing message" : `replying to ${replyingTo?.mine ? me.username : other.username}`}</span><button type="button" onClick={cancelAction} className="ml-auto text-[10px] font-bold uppercase text-slate-400 hover:text-white">cancel</button></div>}

      <form onSubmit={submit} className="flex gap-2 border-t border-white/10 bg-slate-900/90 p-2.5 sm:p-3" style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom, 0px))" }}>
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value.slice(0, MAX_LEN))} placeholder={editingId !== null ? "Edit your message…" : `Message ${other.username}…`} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-base text-white placeholder:text-slate-600 focus:border-orange-500/60 focus:outline-none sm:text-sm" />
        <button type="submit" disabled={busy || !input.trim()} className="clip-btn bg-gradient-to-r from-orange-500 to-amber-400 px-6 py-2.5 font-display text-xs uppercase tracking-widest text-slate-950 transition hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-40">{busy ? "…" : editingId !== null ? "Save →" : "Send →"}</button>
      </form>
    </div>
  );
}
