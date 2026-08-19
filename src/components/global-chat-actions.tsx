"use client";

import { useEffect, useRef, useState } from "react";

const REACTIONS = ["❤️", "😂", "🔥", "😮", "😢", "😡", "👍", "💀"];
const DOUBLE_TAP_MS = 320;

interface ActionState {
  top: number; left: number; id: number; username: string; content: string; mine: boolean;
}
interface ReactionState { counts: Record<string, number>; selected: string | null }

function getReactKey(el: HTMLElement): string | null {
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
  if (!key) return null;
  let fiber = (el as unknown as Record<string, unknown>)[key] as { key?: unknown; return?: unknown } | undefined;
  for (let i = 0; fiber && i < 12; i += 1) {
    if (fiber.key !== null && fiber.key !== undefined) return String(fiber.key);
    fiber = fiber.return as typeof fiber;
  }
  return null;
}

function renderReactions(row: HTMLElement, reaction: ReactionState) {
  let box = row.querySelector<HTMLElement>("[data-reaction-summary]");
  if (!box) {
    box = document.createElement("div");
    box.dataset.reactionSummary = "true";
    box.className = "mt-1 flex flex-wrap gap-1";
    row.appendChild(box);
  }
  box.replaceChildren();
  for (const [emoji, count] of Object.entries(reaction.counts)) {
    if (!count) continue;
    const chip = document.createElement("span");
    chip.className = "rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs";
    chip.textContent = `${emoji} ${count}`;
    box.appendChild(chip);
  }
}

export function GlobalChatActions() {
  const [action, setAction] = useState<ActionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [reactions, setReactions] = useState<ReactionState>({ counts: {}, selected: null });
  const lastTap = useRef(0);

  useEffect(() => {
    if (!window.location.pathname.startsWith("/chat/")) return;

    const getMessage = (target: EventTarget | null) => {
      const el = target instanceof HTMLElement ? target : null;
      const row = (el?.closest("[data-chat-message-id]") || el?.closest(".group.flex.gap-3")) as HTMLElement | null;
      if (!row) return null;
      const id = Number(row.dataset.chatMessageId || getReactKey(row));
      const username = row.querySelector<HTMLAnchorElement>('a[href^="/players/"]')?.textContent?.trim();
      const content = row.querySelector("p")?.textContent?.trim();
      if (!Number.isInteger(id) || id <= 0 || !username || !content) return null;
      const mine = document.body.dataset.currentUsername === username || Boolean(row.querySelector(".text-orange-400"));
      return { row, id, username, content, mine };
    };

    const open = (target: EventTarget | null) => {
      const found = getMessage(target);
      if (!found) return;
      const rect = found.row.getBoundingClientRect();
      setAction({ top: Math.min(rect.bottom + 8, window.innerHeight - 220), left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - 240)), id: found.id, username: found.username, content: found.content, mine: found.mine });
      const box = found.row.querySelector<HTMLElement>("[data-reaction-summary]");
      setReactions({ counts: box ? parseReactionChips(box) : {}, selected: null });
      setPicker(false);
    };

    const onDoubleClick = (event: MouseEvent) => open(event.target);
    const onTouchEnd = (event: TouchEvent) => { const now = Date.now(); if (now - lastTap.current <= DOUBLE_TAP_MS) { event.preventDefault(); open(event.target); } lastTap.current = now; };
    const onDocumentClick = (event: MouseEvent) => { const target = event.target as HTMLElement | null; if (!target?.closest("[data-global-chat-actions]")) { setAction(null); setPicker(false); } };
    document.addEventListener("dblclick", onDoubleClick);
    document.addEventListener("touchend", onTouchEnd, { passive: false });
    document.addEventListener("click", onDocumentClick);
    return () => { document.removeEventListener("dblclick", onDoubleClick); document.removeEventListener("touchend", onTouchEnd); document.removeEventListener("click", onDocumentClick); };
  }, []);

  useEffect(() => {
    const pollReactions = async () => {
      if (!window.location.pathname.startsWith("/chat/") || !action) return;
      try {
        const room = new URLSearchParams(window.location.search).get("room");
        if (!room) return;
        const res = await fetch(`/api/chat/messages?room=${encodeURIComponent(room)}&after=0`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const msg = Array.isArray(data.messages) ? data.messages.find((m: { id?: number }) => m.id === action.id) : null;
        if (msg?.reactions) {
          setReactions(msg.reactions);
          const row = document.querySelector<HTMLElement>(`[data-chat-message-id="${action.id}"]`);
          if (row) renderReactions(row, msg.reactions);
        }
      } catch { /* next poll retries */ }
    };
    void pollReactions();
    const timer = setInterval(pollReactions, 3000);
    return () => clearInterval(timer);
  }, [action]);

  if (!action) return null;

  async function react(emoji: string) {
    const currentAction = action;
    if (!currentAction) return;
    setBusy(true);
    try {
      const res = await fetch("/api/chat/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "react", id: currentAction.id, emoji }) });
      const data = await res.json();
      if (!res.ok) { window.alert(data.error ?? "Reaction failed."); return; }
      if (data.counts) setReactions({ counts: data.counts, selected: data.selected ?? null });
      const row = document.querySelector<HTMLElement>(`[data-chat-message-id="${currentAction.id}"]`);
      if (row && data.counts) renderReactions(row, { counts: data.counts, selected: data.selected ?? null });
      setPicker(false);
    } catch (error) { window.alert(error instanceof Error ? error.message : "Reaction failed."); }
    finally { setBusy(false); }
  }

  async function reply() {
    const currentAction = action; if (!currentAction) return;
    const text = window.prompt(`Reply to @${currentAction.username}`); if (!text?.trim()) return;
    setBusy(true); try { const res = await fetch("/api/chat/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "reply", id: currentAction.id, content: text.trim() }) }); const data = await res.json(); if (!res.ok) window.alert(data.error ?? "Reply failed."); else window.location.reload(); } finally { setBusy(false); setAction(null); }
  }

  async function edit() {
    const currentAction = action; if (!currentAction) return;
    const text = window.prompt("Edit your message", currentAction.content); if (text === null || !text.trim() || text.trim() === currentAction.content) return;
    setBusy(true); try { const res = await fetch("/api/chat/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "edit", id: currentAction.id, content: text.trim() }) }); const data = await res.json(); if (!res.ok) window.alert(data.error ?? "Edit failed."); else window.location.reload(); } finally { setBusy(false); setAction(null); }
  }

  return (
    <div data-global-chat-actions className="fixed z-[9999] w-[232px] rounded-xl border border-white/15 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur" style={{ top: action.top, left: action.left }} onClick={(e) => e.stopPropagation()}>
      <p className="truncate px-2 py-1 font-hud text-[9px] uppercase tracking-widest text-slate-500">@{action.username}</p>
      <button disabled={busy} onClick={() => setPicker((v) => !v)} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10 disabled:opacity-50">❤️ React</button>
      {picker && <div className="grid grid-cols-8 gap-1 border-y border-white/10 px-2 py-2">{REACTIONS.map((emoji) => <button key={emoji} type="button" disabled={busy} onClick={() => void react(emoji)} className="rounded-lg p-1.5 text-xl transition hover:scale-125 hover:bg-white/10 disabled:opacity-50" title={`React ${emoji}`}>{emoji}</button>)}</div>}
      <button disabled={busy} onClick={() => void reply()} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10 disabled:opacity-50">↩ Reply</button>
      {action.mine && <button disabled={busy} onClick={() => void edit()} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10 disabled:opacity-50">✏️ Edit · 3 min</button>}
    </div>
  );
}

function parseReactionChips(box: HTMLElement): Record<string, number> {
  const result: Record<string, number> = {};
  box.querySelectorAll("span").forEach((chip) => {
    const text = chip.textContent?.trim() ?? "";
    const match = text.match(/^(.*) (\d+)$/);
    if (match) result[match[1]] = Number(match[2]);
  });
  return result;
}
