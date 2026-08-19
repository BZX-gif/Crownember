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
  const [editId, setEditId] = useState<number | null>(null);
  const [replyId, setReplyId] = useState<number | null>(null);
  const [text, setText] = useState("");
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
      setPickerId(null); setEditId(null); setReplyId(null); setText(""); setError("");
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
      const msg = messages.find((m) => m.id === id);
      const res = await fetch("/api/chat/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "react", id, emoji, room, username: msg?.user.username, messageContent: msg?.content }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Reaction failed."); return; }
      setPickerId(null); setOpenId(null); await refresh();
    } catch { setError("Network error — try again."); }
  }

  async function submitAction(type: "edit" | "reply") {
    if (openId === null || !text.trim()) return;
    setError("");
    try {
      const res = await fetch("/api/chat/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id: openId, content: text.trim(), room }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? `${type === "edit" ? "Edit" : "Reply"} failed.`); return; }
      setText(""); setEditId(null); setReplyId(null); setOpenId(null); await refresh(); window.location.reload();
    } catch { setError("Network error — try again."); }
  }

  const selectedMessage = openId === null ? null : messages.find((m) => m.id === openId) ?? null;

  return openId === null ? null : (
    <div className="fixed inset-0 z-[80]" onClick={() => { setOpenId(null); setPickerId(null); setEditId(null); setReplyId(null); }}>
      <div className="absolute left-1/2 top-1/2 w-[min(94vw,430px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-orange-500/30 bg-slate-950 p-3 shadow-2xl shadow-black/60" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between"><span className="font-hud text-[10px] font-black uppercase tracking-[.2em] text-slate-500">Message actions</span><button className="text-slate-500 hover:text-white" onClick={() => setOpenId(null)}>✕</button></div>
        {selectedMessage && <p className="mb-3 max-h-20 overflow-hidden rounded-xl border border-white/5 bg-white/[.03] p-2 text-sm text-slate-300">{selectedMessage.content}</p>}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setPickerId((v) => v === openId ? null : openId); setEditId(null); setReplyId(null); }} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10">😊 React</button>
          <button onClick={() => { setReplyId(openId); setEditId(null); setPickerId(null); setText(""); }} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10">↩ Reply</button>
          <button onClick={() => { setEditId(openId); setReplyId(null); setPickerId(null); setText(selectedMessage?.content ?? ""); }} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10">✏️ Edit</button>
        </div>
        {pickerId === openId && <div className="mt-3 grid grid-cols-8 gap-1 rounded-xl border border-white/10 bg-black/30 p-2">{REACTIONS.map((emoji) => { const state = reactions[String(openId)]; const count = state?.counts?.[emoji] ?? 0; const selected = state?.selected === emoji; return <button key={emoji} onClick={() => void react(openId, emoji)} className={`rounded-lg px-1 py-2 text-xl hover:bg-orange-500/15 ${selected ? "bg-orange-500/20 ring-1 ring-orange-400" : ""}`}>{emoji}{count > 0 && <span className="ml-0.5 text-[9px] text-slate-400">{count}</span>}</button>; })}</div>}
        {(editId === openId || replyId === openId) && <div className="mt-3"><textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 400))} autoFocus rows={3} className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-orange-500/50" placeholder={editId === openId ? "Edit your message…" : "Write a reply…"} /><div className="mt-2 flex justify-end gap-2"><button onClick={() => { setEditId(null); setReplyId(null); setText(""); }} className="rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-white/5">Cancel</button><button onClick={() => void submitAction(editId === openId ? "edit" : "reply")} disabled={!text.trim()} className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-40">{editId === openId ? "Save edit" : "Send reply"}</button></div></div>}
        {error && <p className="mt-2 text-xs font-semibold text-rose-400">{error}</p>}
        <p className="mt-3 text-[10px] text-slate-600">Double-click a message to open actions.</p>
      </div>
    </div>
  );
}
