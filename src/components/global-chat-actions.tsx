"use client";

import { useEffect, useRef, useState } from "react";

interface ActionState {
  top: number;
  left: number;
  room: string;
  username: string;
  content: string;
  mine: boolean;
}

const DOUBLE_TAP_MS = 320;

export function GlobalChatActions() {
  const [action, setAction] = useState<ActionState | null>(null);
  const [busy, setBusy] = useState(false);
  const lastTap = useRef(0);

  useEffect(() => {
    if (!window.location.pathname.startsWith("/chat/")) return;

    const getMessage = (target: EventTarget | null) => {
      const el = target instanceof HTMLElement ? target : null;
      const row = el?.closest(".group.flex.gap-3") as HTMLElement | null;
      if (!row) return null;
      const username = row.querySelector<HTMLAnchorElement>(
        'a[href^="/players/"]',
      )?.textContent?.trim();
      const content = row.querySelector("p")?.textContent?.trim();
      if (!username || !content) return null;
      const mine = Boolean(row.querySelector(".bg-orange-400"));
      return { row, username, content, mine };
    };

    const open = (target: EventTarget | null) => {
      const found = getMessage(target);
      if (!found) return;
      const rect = found.row.getBoundingClientRect();
      const room = decodeURIComponent(window.location.pathname.split("/").pop() ?? "");
      const width = 220;
      setAction({
        top: Math.min(rect.bottom + 8, window.innerHeight - 170),
        left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8)),
        room,
        username: found.username,
        content: found.content,
        mine: found.mine,
      });
    };

    const onDoubleClick = (event: MouseEvent) => open(event.target);
    const onTouchEnd = (event: TouchEvent) => {
      const now = Date.now();
      if (now - lastTap.current <= DOUBLE_TAP_MS) {
        event.preventDefault();
        open(event.target);
      }
      lastTap.current = now;
    };
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-global-chat-actions]")) setAction(null);
    };

    document.addEventListener("dblclick", onDoubleClick);
    document.addEventListener("touchend", onTouchEnd, { passive: false });
    document.addEventListener("click", onDocumentClick);
    return () => {
      document.removeEventListener("dblclick", onDoubleClick);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("click", onDocumentClick);
    };
  }, []);

  if (!action) return null;
  const currentAction = action;

  async function request(type: "react" | "reply" | "edit", content?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/chat/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          room: currentAction.room,
          username: currentAction.username,
          message: currentAction.content,
          content,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error ?? "Action failed.");
        return;
      }
      window.location.reload();
    } finally {
      setBusy(false);
      setAction(null);
    }
  }

  async function edit() {
    const next = window.prompt("Edit your message", currentAction.content);
    if (next === null || !next.trim() || next.trim() === currentAction.content) return;
    await request("edit", next.trim());
  }

  async function reply() {
    const replyText = window.prompt(`Reply to @${currentAction.username}`);
    if (!replyText?.trim()) return;
    await request("reply", replyText.trim());
  }

  return (
    <div
      data-global-chat-actions
      className="fixed z-[9999] w-[220px] rounded-xl border border-white/15 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur"
      style={{ top: currentAction.top, left: currentAction.left }}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="truncate px-2 py-1 font-hud text-[9px] uppercase tracking-widest text-slate-500">
        @{currentAction.username}
      </p>
      <button disabled={busy} onClick={() => void request("react")} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10 disabled:opacity-50">
        ❤️ React
      </button>
      <button disabled={busy} onClick={() => void reply()} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10 disabled:opacity-50">
        ↩ Reply
      </button>
      {currentAction.mine && (
        <button disabled={busy} onClick={() => void edit()} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10 disabled:opacity-50">
          ✏️ Edit · 3 min
        </button>
      )}
    </div>
  );
}
