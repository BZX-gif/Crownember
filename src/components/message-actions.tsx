"use client";

import { useRef, useState } from "react";

interface MessageActionsProps {
  messageId: number;
  room: string;
  username: string;
  message: string;
  mine: boolean;
  createdAt: string;
  onChanged: () => void;
}

const EDIT_WINDOW_MS = 3 * 60 * 1000;
const DOUBLE_TAP_MS = 320;

export function MessageActions({
  messageId,
  room,
  username,
  message,
  mine,
  createdAt,
  onChanged,
}: MessageActionsProps) {
  const [open, setOpen] = useState(false);
  const [reactionCount, setReactionCount] = useState(0);
  const lastTap = useRef(0);
  const canEdit = mine && Date.now() - new Date(createdAt).getTime() <= EDIT_WINDOW_MS;

  function activate(event?: { preventDefault?: () => void }) {
    event?.preventDefault?.();
    setOpen(true);
  }

  function touchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const now = Date.now();
    if (now - lastTap.current <= DOUBLE_TAP_MS) activate(event);
    lastTap.current = now;
  }

  async function action(type: "react" | "reply" | "edit", content?: string) {
    const res = await fetch("/api/chat/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id: messageId, room, username, message, content }),
    });
    const data = await res.json();
    if (!res.ok) {
      window.alert(data.error ?? "Action failed.");
      return;
    }
    if (type === "react") setReactionCount(Number(data.count ?? 0));
    else onChanged();
    if (type !== "react") setOpen(false);
  }

  async function reply() {
    const content = window.prompt(`Reply to @${username}`);
    if (content?.trim()) await action("reply", content.trim());
  }

  async function edit() {
    const content = window.prompt("Edit your message", message);
    if (content?.trim() && content.trim() !== message) await action("edit", content.trim());
  }

  return (
    <div className="relative" onDoubleClick={activate} onTouchEnd={touchEnd}>
      {open && (
        <>
          <button aria-label="Close message actions" className="fixed inset-0 z-[9998] cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-[9999] mt-1 flex w-max min-w-[190px] flex-col rounded-xl border border-white/10 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur">
            <button onClick={() => void action("react")} className="rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10">
              ❤️ React{reactionCount > 0 ? ` · ${reactionCount}` : ""}
            </button>
            <button onClick={() => void reply()} className="rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10">
              ↩ Reply
            </button>
            {canEdit && (
              <button onClick={() => void edit()} className="rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10">
                ✏️ Edit · 3 min
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
