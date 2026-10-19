"use client";

import { formatDate, timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Relative timestamps are a client concern: the server and the browser render
 * at different instants, so a value like "just now" can legitimately differ
 * between the two passes. This component keeps a machine-readable `dateTime`
 * for every renderer (and an exact timestamp in the tooltip), while letting
 * the browser own the human text so hydration never mismatches.
 */
export function RelativeTime({
  date,
  className,
  absolute = false,
}: {
  date: Date | string;
  className?: string;
  absolute?: boolean;
}) {
  const value = typeof date === "string" ? new Date(date) : date;
  return (
    <time
      dateTime={value.toISOString()}
      title={formatDate(value)}
      suppressHydrationWarning
      className={cn("tabular-nums", className)}
    >
      {absolute ? formatDate(value) : timeAgo(value)}
    </time>
  );
}
