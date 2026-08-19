"use client";

import { useEffect, useRef, useState } from "react";

const REACTIONS = ["❤️", "😂", "🔥", "😮", "😢", "😡", "👍", "💀"];

type ReactionData = { counts: Record<string, number>; selected: string | null };

function roomSlug() {
  if (typeof window === "undefined") return "";
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[0] === "chat" ? decodeURIComponent(parts[1] ?? "") : "";
}

export function GlobalChatActions() {
  const [picker, setPicker] = useState<{ id: number; top: number; left: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const slugRef = useRef("");

  useEffect(() => {
    slugRef.current = roomSlug();
    let cancelled = false;

    async function decorate() {
      if (cancelled || !slugRef.current) return;
      try {
        const [messagesRes, reactionsRes] = await Promise.all([
          fetch(`/api/chat/messages?room=${encodeURIComponent(slugRef.current)}&after=0`, { cache: "no-store" }),
          fetch(`/api/chat/reactions?room=${encodeURIComponent(slugRef.current)}`, { cache: "no-store" }),
        ]);
        if (!messagesRes.ok || !reactionsRes.ok) return;
        const messageData = await messagesRes.json();
        const reactionData = await reactionsRes.json() as { messages: Record<string, ReactionData> };
        const messages = Array.isArray(messageData.messages) ? messageData.messages : [];

        const nodes = Array.from(document.querySelectorAll<HTMLElement>(".group.flex.gap-3"));
        const used = new Set<number>();

        for (const node of nodes) {
          if (node.dataset.chatReactionReady === "1") continue;
          const username = node.querySelector("a[href^='/players/']")?.textContent?.trim() ?? "";
          const contentNode = node.querySelector("p.mt-0\\.5") ?? node.querySelector("p");
          const content = contentNode?.textContent?.trim() ?? "";
          const match = messages.find((m: any) => !used.has(m.id) && m.user?.username === username && m.content === content);
          if (!match) continue;
          used.add(match.id);
          node.dataset.chatReactionReady = "1";
          node.dataset.chatMessageId = String(match.id);

          const bar = document.createElement("div");
          bar.className = "mt-1.5 flex flex-wrap items-center gap-1.5";
          bar.dataset.reactionBar = "1";
          const data = reactionData.messages[String(match.id)] ?? { counts: {}, selected: null };

          const render = () => {
            bar.replaceChildren();
            for (const emoji of REACTIONS) {
              const count = Number(data.counts[emoji] ?? 0);
              if (!count && data.selected !== emoji) continue;
              const b = document.createElement("button");
              b.type = "button";
              b.textContent = `${emoji}${count ? ` ${count}` : ""}`;
              b.className = `rounded-full border px-2 py-0.5 text-xs transition ${data.selected === emoji ? "border-orange-400/70 bg-orange-500/20 text-orange-200" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`;
              b.onclick = async () => {
                const r = await fetch("/api/chat/reactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: match.id, emoji }) });
                if (r.ok) await refresh();
              };
              bar.appendChild(b);
            }
            const plus = document.createElement("button");
            plus.type = "button";
            plus.textContent = "+";
            plus.title = "React";
            plus.className = "h-6 min-w-6 rounded-full border border-white/10 bg-white/5 px-1.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white";
            plus.onclick = (e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setPicker({ id: match.id, top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 310) });
            };
            bar.appendChild(plus);
          };

          const refresh = async () => {
            const r = await fetch(`/api/chat/reactions?room=${encodeURIComponent(slugRef.current)}`, { cache: "no-store" });
            if (!r.ok) return;
            const fresh = await r.json() as { messages: Record<string, ReactionData> };
            const next = fresh.messages[String(match.id)] ?? { counts: {}, selected: null };
            data.counts = next.counts;
            data.selected = next.selected;
            render();
          };
          render();
          node.appendChild(bar);
        }
      } catch {
        // Retry on the next poll.
      }
    }

    void decorate();
    const timer = window.setInterval(decorate, 2500);
    const observer = new MutationObserver(() => void decorate());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!picker) return;
    const close = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPicker(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [picker]);

  if (!picker) return null;
  return (
    <div ref={pickerRef} className="fixed z-[9999] rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur" style={{ top: picker.top, left: picker.left }}>
      <div className="grid grid-cols-4 gap-1">
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await fetch("/api/chat/reactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: picker.id, emoji }) });
                setPicker(null);
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-xl px-3 py-2 text-xl transition hover:scale-110 hover:bg-white/10 disabled:opacity-50"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
