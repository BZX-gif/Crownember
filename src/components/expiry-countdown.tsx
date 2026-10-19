"use client";

import { useEffect, useState } from "react";
import { formatTimeLeft, msUntilExpiry, ttlForRoom } from "@/lib/retention";
import { cn } from "@/lib/utils";

/**
 * Remaining lifetime of an ephemeral message, on a fixed half-minute tick.
 *
 * The countdown is a client-only value: a server render would compute it once
 * and then sit frozen until some unrelated state changed. The first client
 * paint deliberately shows only the static retention window ("3h") so the
 * hydration pass matches the server exactly, then the live value takes over.
 */
export function ExpiryCountdown({
  createdAt,
  vault,
}: {
  createdAt: Date | string;
  vault: boolean;
}) {
  const total = ttlForRoom(vault);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    const settle = setTimeout(() => setNow(Date.now()), 0);
    return () => {
      clearInterval(timer);
      clearTimeout(settle);
    };
  }, []);

  const left = now === null ? total : msUntilExpiry(createdAt, vault, now);
  const danger = left < Math.min(2 * 60_000, total * 0.15);
  const warn = left < total * 0.3;
  return (
    <span
      aria-label={`Clears in ${formatTimeLeft(left)}`}
      className={cn(
        "text-[11px] tabular-nums",
        danger ? "text-danger" : warn ? "text-muted" : "text-subtle",
      )}
      title={`This message clears ${vault ? "14 minutes" : "3 hours"} after it was sent`}
    >
      {now === null ? (vault ? "14m" : "3h") : formatTimeLeft(left)}
    </span>
  );
}
