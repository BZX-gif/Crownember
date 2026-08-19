"use client";

import { useEffect, useMemo, useState } from "react";

const REACTIONS = ["❤️", "😂", "🔥", "😮", "😢", "😡", "👍", "💀"];

type Msg = {
  id: number;
  content: string;
  user: { username: string };
  reactions?: { counts?: Record<string, number>; selected?: string | null };
};

export function GlobalChatActions() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [pickerId, setPickerId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const room = useMemo(() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts[0] === "chat" ? parts[1] ?? "global" : "global";
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/chat/messages?room=${encodeURIComponent(room)}&after=0`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (alive && Array.isArray(data.messages)) setMessages(data.messages as Msg[]);
      } catch {}
    };
    void load();
    const timer = window.setInterval(load, 2500);
    return () => { alive = false; window.clearInterval(timer); };
  }, [room]);

  useEffect(() => {
    const root = document.querySelector("main") ?? document.body;
    const findMessage = (el: HTMLElement) => {
      const text = el.textContent?.trim() ?? "";
      const candidates = messages.filter((m) => text.includes(m.user.username) && text.includes(m.content));
      return candidates.length === 1 ? candidates[0] : candidates.at(-1) ?? null;
    };

    const onDblClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const row = target?.closest(".group") as HTMLElement | null;
      if (!row) return;
      const msg = findMessage(row);
      if (!msg) return;
      event.preventDefault();
      setOpenId(msg.id);
      setPickerId(null);
      setError("");
    };

    root.addEventListener("dblclick", onDblClick);
    return () => root.removeEventListener("dblclick", onDblClick);
  }, [messages]);

  async function react(id: number, emoji: string) {
    setError("");
    try {
      const res = await fetch("/api/chat/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "react", id, emoji }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Reaction failed."); return; }
      setPickerId(null);
      setOpenId(null);
      // Force an immediate shared-state refresh; the normal poll keeps everyone synced.
      const refresh = await fetch(`/api/chat/messages?room=${encodeURIComponent(room)}&after=0`, { cache: "no-store" });
      if (refresh.ok) {
        const next = await refresh.json();
        if (Array.isArray(next.messages)) setMessages(next.messages as Msg[]);
      }
    } catch { setError("Network error — try again."); }
  }

  return (
    <>
      {openId !== null && (
        <div className="fixed inset-0 z-[80]" onClick={() => { setOpenId(null); setPickerId(null); }}>
          <div className="absolute left-1/2 top-1/2 w-[min(94vw,430px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-orange-500/30 bg-slate-950 p-3 shadow-2xl shadow-black/60" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-hud text-[10px] font-black uppercase tracking-[.2em] text-slate-500">Message actions</span>
              <button className="text-slate-500 hover:text-white" onClick={() => setOpenId(null)}>✕</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setPickerId((v) => v === openId ? null : openId)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10">😊 React</button>
              <button onClick={() => { setOpenId(null); window.dispatchEvent(new CustomEvent("crownember:reply", { detail: { id: openId } })); }} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10">↩ Reply</button>
            </div>
            {pickerId === openId && (
              <div className="mt-3 grid grid-cols-8 gap-1 rounded-xl border border-white/10 bg-black/30 p-2">
                {REACTIONS.map((emoji) => {
                  const msg = messages.find((m) => m.id === openId);
                  const count = msg?.reactions?.counts?.[emoji] ?? 0;
                  const selected = msg?.reactions?.selected === emoji;
                  return <button key={emoji} onClick={() => void react(openId, emoji)} className={`rounded-lg px-1 py-2 text-xl hover:bg-orange-500/15 ${selected ? "bg-orange-500/20 ring-1 ring-orange-400" : ""}`} title={`${emoji}${count ? ` ${count}` : ""}`}>{emoji}{count > 0 && <span className="ml-0.5 text-[9px] text-slate-400">{count}</span>}</button>;
                })}
              </div>
            )}
            {error && <p className="mt-2 text-xs font-semibold text-rose-400">{error}</p>}
            <p className="mt-3 text-[10px] text-slate-600">Double-click a message to open this menu.</p>
          </div>
        </div>
      )}
    </>
  );
}
