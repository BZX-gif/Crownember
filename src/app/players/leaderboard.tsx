"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, DevChip, FounderChip, RankBadge } from "@/components/ui";
import { avatarUrl, cn } from "@/lib/utils";
import type { PublicUser } from "@/lib/utils";

const POSITION_STYLE = ["text-amber-400", "text-slate-300", "text-amber-700"];

export function Leaderboard({ byXp, byLikes }: { byXp: PublicUser[]; byLikes: PublicUser[] }) {
  const [tab, setTab] = useState<"xp" | "likes">("xp");
  const rows = tab === "xp" ? byXp : byLikes;
  return (
    <div className="mt-8">
      <div className="mx-auto flex w-fit rounded-full border border-white/10 bg-slate-900 p-1">
        <button onClick={() => setTab("xp")} className={cn("rounded-full px-6 py-2 text-sm font-black transition", tab === "xp" ? "bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950" : "text-slate-400 hover:text-white")}>⭐ By XP</button>
        <button onClick={() => setTab("likes")} className={cn("rounded-full px-6 py-2 text-sm font-black transition", tab === "likes" ? "bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950" : "text-slate-400 hover:text-white")}>❤️ By Likes</button>
      </div>
      <div className="mt-6 space-y-2">
        {rows.length === 0 && <p className="py-10 text-center text-slate-500">No players yet — be the first!</p>}
        {rows.map((p, i) => <Link key={p.id} href={`/players/${encodeURIComponent(p.username)}`} className={cn("flex items-center gap-3 rounded-2xl border p-3.5 transition sm:gap-4 sm:px-5", i === 0 ? "border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-transparent" : "border-white/10 bg-slate-900/60 hover:border-orange-500/30")}>
          <span className={cn("w-8 text-center text-lg font-black", POSITION_STYLE[i] ?? "text-slate-600")}>{i === 0 ? "👑" : `#${i + 1}`}</span>
          <Avatar name={p.username} color={p.avatarColor} avatarUrl={avatarUrl(p.username, p.avatarVersion)} size={44} dev={p.dev} />
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-black text-white">{p.username}</p><RankBadge rank={p.rank} size="xs" />{p.founder && <FounderChip size="xs" />}{p.dev && <DevChip size="xs" />}</div>
            <div className="mt-1.5 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${Math.max(4, p.rank.progress * 100)}%`, backgroundColor: p.rank.color }} /></div>
            {p.rank.nextMinXp !== null && <p className="mt-1 text-[11px] text-slate-500">{p.rank.nextMinXp - p.xp} XP to {p.rank.nextMinXp && "next rank"}</p>}
          </div>
          <div className="text-right"><p className="text-lg font-black text-fire">{tab === "xp" ? `${p.xp.toLocaleString()} XP` : `❤️ ${p.likes.toLocaleString()}`}</p><p className="text-[11px] text-slate-500">Level {p.rank.level}{p.uid ? ` · UID ${p.uid}` : ""}</p></div>
        </Link>)}
      </div>
    </div>
  );
}
