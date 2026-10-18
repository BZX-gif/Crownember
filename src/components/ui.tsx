export { Avatar } from "@/components/avatar";

import { cn } from "@/lib/utils";
import type { RankInfo } from "@/lib/ranks";

export function RankBadge({ rank, size = "sm", className }: { rank: RankInfo; size?: "xs" | "sm" | "md"; className?: string }) {
  const sizes = { xs: "px-1.5 py-0.5 text-[10px] gap-1", sm: "px-2 py-0.5 text-xs gap-1", md: "px-2.5 py-1 text-xs gap-1.5" } as const;
  return (
    <span
      className={cn("inline-flex items-center rounded-full border font-medium", sizes[size], className)}
      style={{ color: rank.color, borderColor: `${rank.color}44`, backgroundColor: `${rank.color}0d` }}
      title={`${rank.name} rank`}
    >
      <span aria-hidden>{rank.icon}</span>
      {rank.name}
    </span>
  );
}

export function FounderChip({ size = "xs", className }: { size?: "xs" | "sm" | "md"; className?: string }) {
  const sizes = { xs: "px-1.5 py-0.5 text-[10px]", sm: "px-2 py-0.5 text-xs", md: "px-2.5 py-1 text-xs" } as const;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/[0.07] font-semibold uppercase tracking-wider text-zinc-200", sizes[size], className)}
      title="Founding member — one of VYRON's first ten members"
    >
      <span aria-hidden>✦</span> Founder
    </span>
  );
}

export function DevChip({ size = "xs", className }: { size?: "xs" | "sm"; className?: string }) {
  const sizes = { xs: "px-1.5 py-0.5 text-[9px]", sm: "px-2 py-0.5 text-[10px]" } as const;
  return (
    <span
      className={cn("dev-chip inline-flex items-center gap-0.5 rounded-full font-bold uppercase tracking-[0.15em] text-black", sizes[size], className)}
      title="The builder of VYRON"
    >
      ⚡ Dev
    </span>
  );
}

export function OnlineDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative flex h-2 w-2", className)}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
    </span>
  );
}
