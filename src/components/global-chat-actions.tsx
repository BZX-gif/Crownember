"use client";

import { useEffect, useMemo, useState } from "react";

const REACTIONS = ["❤️", "😂", "🔥", "😮", "😢", "😡", "👍", "💀"];
type Msg = { id: number; content: string; user: { username: string } };
type Reaction = { counts: Record<string, number>; selected: string | null };

export function GlobalChatActions() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reactions, setReactions] = useState<Record<string, Reaction>>({});
  const [openId, setOpenId] = useState<number | null>(null);
  const [pickerId, setPickerId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const room = useMemo(() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts[0] === "chat" ? parts[1] ?? "global" : "global";
  }, []);

  async function refresh() {
    try {
      const [messagesRes, reactionsRes] = await Promise.all([
        fetch(`/api/chat/messages?room=${encodeURIComponent(room)}&after=0`, { cache: "no-store" }),
        fetch(`/api/chat/reactions?room=${encodeURIComponent(room)}`, { cache: "no-store" }),
      ]);
      if (messagesRes.ok) {
        const data = await messagesRes.json();
        if (Array.isArray(data.messages)) setMessages(data.messages as Msg[]);
      }
      if (reactionsRes.ok) {
        const data = await reactionsRes.json();
        if (data.messages && typeof data.messages === "object") setReactions(data.messages);
      }
    } catch {}
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => window.clearInterval(timer);
  }, [room]);

  function findMessage(el: HTMLElement): Msg | null {
    const text = el.textContent?.trim() ?? "";
    const candidates = messages.filter((m) => text.includes(m.user.username) && text.includes(m.content));
    return candidates.at(-1) ?? null;
  }

  useEffect(() => {
    const root = document.querySelector("main") ?? document.body;
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

  useEffect(() => {
    const rows = Array.from(document.querySelectorAll(".group")) as HTMLElement[];
    for (const row of rows) {
      row.querySelectorAll("[data-crown-reactions]").forEach((el) => el.remove());
      const msg = findMessage(row);
      if (!msg) continue;
      const state = reactions[String(msg.id)];
      if (!state) continue;
      const active = Object.entries(state.counts).filter(([, count]) => count > 0);
      if (!active.length) continue;
      const bar = document.createElement("div");
      bar.dataset.crownReactions = "1";
      bar.className = "mt-1.5 flex flex-wrap gap-1";
      for (const [emoji, count] of active) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `rounded-full border px-2 py-0.5 text-xs transition ${state.selected === emoji ? "border-orange-400/70 bg-orange-500/20" : "border-white/10 bg-white/5 hover:bg-white/10"}`;
        button.textContent = `${emoji} ${count}`;
        button.onclick = () => void react(msg.id, emoji);
        bar.appendChild(button);
      }
      row.appendChild(bar);
    }
  }, [messages, reactions]);

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
      await refresh();
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
            <button onClick={() => setPickerId((v) => v === openId ? null : openId)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10">😊 React</button>
            {pickerId === openId && (
              <div className="mt-3 grid grid-cols-8 gap-1 rounded-xl border border-white/10 bg-black/30 p-2">
                {REACTIONS.map((emoji) => {
                  const state = reactions[String(openId)];
                  const count = state?.counts?.[emoji] ?? 0;
                  const selected = state?.selected === emoji;
                  return <button key={emoji} onClick={() => void react(openId, emoji)} className={`rounded-lg px-1 py-2 text-xl hover:bg-orange-500/15 ${selected ? "bg-orange-500/20 ring-1 ring-orange-400" : ""}`} title={`${emoji}${count ? ` ${count}` : ""}`}>{emoji}{count > 0 && <span className="ml-0.5 text-[9px] text-slate-400">{count}</span>}</button>;
                })}
              </div>
            )}
            {error && <p className="mt-2 text-xs font-semibold text-rose-400">{error}</p>}
            <p className="mt-3 text-[10px] text-slate-600">Double-click a message to react.</p>
          </div>
        </div>
      )}
    </>
  );
}
