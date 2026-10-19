"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, DevChip, FounderChip, RankBadge } from "@/components/ui";
import { EmptyState } from "@/components/primitives";
import { UsersIcon } from "@/components/icons";
import { cn, type PublicUser } from "@/lib/utils";

export function Leaderboard({
  byXp,
  byLikes,
}: {
  byXp: PublicUser[];
  byLikes: PublicUser[];
}) {
  const [tab, setTab] = useState<"xp" | "likes">("xp");
  const rows = tab === "xp" ? byXp : byLikes;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
        <div className="flex items-center gap-1 rounded-lg border border-line p-0.5" role="tablist" aria-label="Leaderboard metric">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "xp"}
            onClick={() => setTab("xp")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "xp" ? "bg-white/[0.07] text-fg" : "text-muted hover:text-fg",
            )}
          >
            Reputation
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "likes"}
            onClick={() => setTab("likes")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "likes" ? "bg-white/[0.07] text-fg" : "text-muted hover:text-fg",
            )}
          >
            Appreciation
          </button>
        </div>
        <p className="mono-meta hidden sm:block">
          {tab === "xp" ? "Earned by contributing" : "Likes received"}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<UsersIcon size={18} />}
          title="No members to show yet"
          description="Once people start posting and replying, they will appear here."
        />
      ) : (
        <ol className="divide-y divide-line">
          {rows.map((person, index) => (
            <li key={person.id}>
              <Link
                href={`/players/${encodeURIComponent(person.username)}`}
                className="group flex items-center gap-3 py-3.5 transition-colors hover:bg-white/[0.02] sm:gap-4"
              >
                <span
                  className={cn(
                    "mono-meta w-7 shrink-0 text-center",
                    index === 0 && "text-fg",
                    index === 1 && "text-muted",
                    index === 2 && "text-muted",
                  )}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Avatar name={person.username} size={38} dev={person.dev} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-fg sm:text-sm">
                      {person.username}
                    </span>
                    <RankBadge rank={person.rank} size="xs" />
                    {person.founder && <FounderChip size="xs" />}
                    {person.dev && <DevChip size="xs" />}
                  </span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="h-1 w-full max-w-[180px] overflow-hidden rounded-full bg-white/[0.07]">
                      <span
                        className="block h-full rounded-full bg-fg/70"
                        style={{ width: `${Math.max(3, person.rank.progress * 100)}%` }}
                      />
                    </span>
                    <span className="hidden text-[10px] text-subtle sm:inline">
                      Level {person.rank.level}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[13px] font-medium tabular-nums text-fg sm:text-sm">
                    {tab === "xp"
                      ? `${person.xp.toLocaleString()} XP`
                      : `${person.likes.toLocaleString()} likes`}
                  </span>
                  <span className="mt-0.5 hidden text-[10px] text-subtle sm:block">
                    {person.rank.nextMinXp !== null
                      ? `${Math.max(0, person.rank.nextMinXp - person.xp).toLocaleString()} XP to next tier`
                      : "Highest tier"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
