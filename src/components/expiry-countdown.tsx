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
        "text-[10px] tabular-nums",
        danger ? "text-danger" : warn ? "text-muted" : "text-subtle",
      )}
      title={`This message clears ${vault ? "14 minutes" : "3 hours"} after it was sent`}
    >
      {formatTimeLeft(left)}
    </span>
  );
}
