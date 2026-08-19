"use client";

import { useEffect, useRef, useState } from "react";

const REACTIONS = ["❤️", "😂", "🔥", "😮", "😢", "😡", "👍", "💀"];
type ReactionData = { counts: Record<string, number>; selected: string | null };

function getSlug() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[0] === "chat" ? decodeURIComponent(parts[1] ?? "") : "";
}

export function GlobalChatActions() {
  const [picker, setPicker] = useState<{ id: number; top: number; left: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const slug = getSlug();
    if (!slug) return;

    async function decorate() {
      if (cancelled) return;
      try {
        const [mr, rr] = await Promise.all([
          fetch(`/api/chat/messages?room=${encodeURIComponent(slug)}&after=0`, { cache: "no-store" }),
          fetch(`/api/chat/reactions?room=${encodeURIComponent(slug)}`, { cache: "no-store" }),
        ]);
        if (!mr.ok || !rr.ok) return;
        const md = await mr.json();
        const rd = await rr.json() as { messages: Record<string, ReactionData> };
        const serverMessages = Array.isArray(md.messages) ? md.messages : [];
        const nodes = Array.from(document.querySelectorAll<HTMLElement>(".group.flex.gap-3"));
        const used = new Set<number>();

        for (const node of nodes) {
          const username = node.querySelector("a[href^='/players/']")?.textContent?.trim() ?? "";
          const content = node.querySelector("p.mt-0\\.5")?.textContent?.trim() ?? "";
          const match = serverMessages.find((m: any) => !used.has(m.id) && m.user?.username === username && m.content === content);
          if (!match) continue;
          used.add(match.id);

          node.dataset.chatMessageId = String(match.id);
          node.querySelector<HTMLElement>("[data-reaction-bar='1']")?.remove();

          const bar = document.createElement("div");
          bar.dataset.reactionBar = "1";
          bar.className = "mt-1.5 flex flex-wrap items-center gap-1.5";
          const state = rd.messages[String(match.id)] ?? { counts: {}, selected: null };

          for (const emoji of REACTIONS) {
            const count = Number(state.counts[emoji] ?? 0);
            if (!count && state.selected !== emoji) continue;
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = `${emoji}${count ? ` ${count}` : ""}`;
            button.className = `rounded-full border px-2 py-0.5 text-xs transition ${state.selected === emoji ? "border-orange-400/70 bg-orange-500/20 text-orange-200" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`;
            button.onclick = async () => {
              const res = await fetch("/api/chat/reactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: match.id, emoji }) });
              if (res.ok) void decorate();
            };
            bar.appendChild(button);
          }

          const plus = document.createElement("button");
          plus.type = "button";
          plus.textContent = "+";
          plus.title = "React";
          plus.className = "h-6 min-w-6 rounded-full border border-white/10 bg-white/5 px-1.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white";
          plus.onclick = (e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setPicker({ id: match.id, top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - 250)) });
          };
          bar.appendChild(plus);
          node.appendChild(bar);
        }
      } catch {
        // Retry on the next interval.
      }
    }

    void decorate();
    const timer = window.setInterval(decorate, 2500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!picker) return;
    const close = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPicker(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [picker]);

  if (!picker) return null;
  return (
    <div ref={pickerRef} className="fixed z-[9999] rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur" style={{ top: picker.top, left: picker.left }}>
      <div className="grid grid-cols-4 gap-1">
        {REACTIONS.map((emoji) => (
          <button key={emoji} type="button" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              await fetch("/api/chat/reactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: picker.id, emoji }) });
              setPicker(null);
            } finally { setBusy(false); }
          }} className="rounded-xl px-3 py-2 text-xl transition hover:scale-110 hover:bg-white/10 disabled:opacity-50">
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
