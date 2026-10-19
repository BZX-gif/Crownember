export { Avatar } from "@/components/avatar";

import { cn } from "@/lib/utils";
import type { RankInfo } from "@/lib/ranks";
import { DevGlyph, RankGlyph, SparkIcon } from "@/components/icons";

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
    xs: "h-5 px-1.5 text-[11px] gap-1",
    sm: "h-6 px-2 text-xs gap-1.5",
    md: "h-7 px-2.5 text-xs gap-1.5",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-line bg-white/[0.03] font-medium text-muted",
        sizes[size],
        className,
      )}
      title={`${rank.name} · ${rank.level} level`}
    >
      <RankGlyph tier={rank.tier} size={size === "md" ? 12 : 10} />
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
    xs: "h-5 px-1.5 text-[11px] gap-1",
    sm: "h-6 px-2 text-xs gap-1.5",
    md: "h-7 px-2.5 text-xs gap-1.5",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-line-strong bg-white/[0.06] font-medium text-fg",
        sizes[size],
        className,
      )}
      title="Founding member — one of the first ten people on VYRON"
    >
      <SparkIcon size={size === "md" ? 12 : 10} />
      Founder
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
  const sizes = {
    xs: "h-5 px-1.5 text-[11px] gap-1",
    sm: "h-6 px-2 text-xs gap-1.5",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-fg font-semibold text-ink",
        sizes[size],
        className,
      )}
      title="VYRON builder"
    >
      <DevGlyph size={size === "sm" ? 11 : 9} />
      Builder
    </span>
  );
}


