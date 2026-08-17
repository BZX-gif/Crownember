"use client";

import { useEffect, useState } from "react";
import { Avatar, RankBadge } from "@/components/ui";
import { ExpiryCountdown } from "@/components/expiry-countdown";
import type { ChatMessageDTO } from "@/lib/utils";

const GLYPHS = "!<>-_\\/[]{}—=+*^?#$%&01";

/** Scramble-decode: glyphs resolve into the real text, terminal style. */
function useScramble(text: string) {
  const [out, setOut] = useState(text);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDone(true);
      return;
    }
    const start = performance.now();
    const dur = Math.min(900, 280 + text.length * 16);
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const resolved = Math.floor(p * text.length);
      let s = text.slice(0, resolved);
      for (let i = resolved; i < text.length; i++) {
        const ch = text[i];
        s += ch === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      setOut(s);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDone(true);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text]);

  return { out, done };
}

/**
 * Developer Signature transmission — the builder's messages arrive as a
 * signed terminal card: animated gradient frame, scramble-decode body,
 * shimmering ⚡ DEVELOPER chip. Unmistakable, unforgeable (server-assigned).
 */
export function DevMessage({
  msg,
  vault,
}: {
  msg: ChatMessageDTO;
  vault: boolean;
}) {
  const { out, done } = useScramble(msg.content);

  return (
    <div className="dev-frame clip-card relative">
      <div className="bg-[#070b08]/95 px-3.5 py-3">
        {/* terminal titlebar */}
        <div className="flex items-center gap-1.5 border-b border-emerald-500/10 pb-2">
          <span className="h-2 w-2 rounded-full bg-rose-500/70" />
          <span className="h-2 w-2 rounded-full bg-amber-400/70" />
          <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
          <span className="ml-auto shrink-0">
            <ExpiryCountdown createdAt={msg.createdAt} vault={vault} />
          </span>
        </div>

        {/* decoded body */}
        <p className="mt-2.5 whitespace-pre-wrap break-words font-hud text-[13px] leading-relaxed text-emerald-300">
          <span className="select-none text-emerald-600">❯ </span>
          {out}
          {!done && <span className="dev-cursor text-emerald-400">▊</span>}
        </p>

        {/* identity strip */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-emerald-500/10 pt-2.5">
          <Avatar
            name={msg.user.username}
            color={msg.user.avatarColor}
            size={22}
            dev
          />
          <span className="dev-name text-sm font-black tracking-wide">
            {msg.user.username}
          </span>
          <span className="dev-chip clip-tag px-2 py-0.5 font-hud text-[9px] font-black uppercase tracking-[0.18em] text-slate-950">
            ⚡ developer
          </span>
          <RankBadge rank={msg.user.rank} size="xs" />
        </div>
      </div>
    </div>
  );
}
