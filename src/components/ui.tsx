import { cn, initials } from "@/lib/utils";
import type { RankInfo } from "@/lib/ranks";

export function Avatar({
  name,
  color,
  avatarUrl,
  size = 40,
  dev = false,
  className,
}: {
  name: string;
  color: string;
  avatarUrl?: string;
  size?: number;
  dev?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "flex select-none items-center justify-center overflow-hidden rounded-full font-bold text-white ring-2",
          dev ? "ring-emerald-400/60" : "ring-white/10",
        )}
        style={{
          width: size,
          height: size,
          fontSize: Math.max(11, Math.round(size * 0.36)),
          background: `linear-gradient(135deg, ${color}, ${color}88)`,
        }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={`${name}'s profile picture`} className="h-full w-full object-cover" />
        ) : (
          initials(name)
        )}
      </div>
      {dev && (
        <span
          className="ghost-badge absolute -bottom-1 -right-1.5 leading-none"
          style={{ fontSize: Math.max(11, Math.round(size * 0.48)) }}
          title="👻 Developer — the ghost in the machine"
        >
          👻
        </span>
      )}
    </div>
  );
}

export function RankBadge({
  rank,
  size = "sm",
  className,
}: {
  rank: RankInfo;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const sizes = {
    xs: "px-1.5 py-0.5 text-[10px] gap-0.5",
    sm: "px-2 py-0.5 text-xs gap-1",
    md: "px-3 py-1 text-sm gap-1.5",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold",
        sizes[size],
        className,
      )}
      style={{
        color: rank.color,
        borderColor: `${rank.color}55`,
        backgroundColor: `${rank.color}14`,
      }}
    >
      <span>{rank.icon}</span>
      {rank.name}
    </span>
  );
}

export function FounderChip({
  size = "xs",
  className,
}: {
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const sizes = {
    xs: "px-1.5 py-0.5 text-[10px]",
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1 text-sm",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-gradient-to-r from-amber-400/20 to-orange-500/15 font-black uppercase tracking-wide text-amber-300",
        sizes[size],
        className,
      )}
      title="Founding Squad — one of the first 10 players of EMBERCROWN"
    >
      🛡️ Founder
    </span>
  );
}

export function DevChip({
  size = "xs",
  className,
}: {
  size?: "xs" | "sm";
  className?: string;
}) {
  const sizes = { xs: "px-1.5 py-0.5 text-[9px]", sm: "px-2 py-0.5 text-[10px]" } as const;
  return (
    <span
      className={cn(
        "dev-chip clip-tag inline-flex items-center gap-0.5 font-black uppercase tracking-[0.15em] text-slate-950",
        sizes[size],
        className,
      )}
      title="Developer — the builder of EMBERCROWN"
    >
      ⚡ Dev
    </span>
  );
}

export function OnlineDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative flex h-2.5 w-2.5", className)}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
  );
}
