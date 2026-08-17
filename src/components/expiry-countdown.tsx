"use client";

import { formatTimeLeft, msUntilExpiry, ttlForRoom } from "@/lib/retention";
import { cn } from "@/lib/utils";

export function ExpiryCountdown({
  createdAt,
  vault,
}: {
  createdAt: Date | string;
  vault: boolean;
}) {
  const total = ttlForRoom(vault);
  const left = msUntilExpiry(createdAt, vault);
  const danger = left < Math.min(2 * 60_000, total * 0.15);
  const warn = left < total * 0.3;
  return (
    <span
      className={cn(
        "font-hud text-[10px] font-bold tracking-wider",
        danger
          ? "animate-pulse text-rose-400"
          : warn
            ? "text-amber-400"
            : "text-slate-500",
      )}
      title={`This message self-destructs ${vault ? "14 minutes" : "3 hours"} after it was sent`}
    >
      ⏳ {formatTimeLeft(left)}
    </span>
  );
}
