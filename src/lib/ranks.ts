export interface Rank {
  name: string;
  icon: string;
  minXp: number;
  color: string;
}

/** Free Fire-inspired rank ladder driven by community XP. */
export const RANKS: Rank[] = [
  { name: "Bronze", icon: "🥉", minXp: 0, color: "#cd7f32" },
  { name: "Silver", icon: "🥈", minXp: 250, color: "#c0c0c0" },
  { name: "Gold", icon: "🥇", minXp: 500, color: "#ffd700" },
  { name: "Platinum", icon: "💎", minXp: 1000, color: "#7dd3fc" },
  { name: "Diamond", icon: "💠", minXp: 1800, color: "#a78bfa" },
  { name: "Heroic", icon: "🛡️", minXp: 3000, color: "#f97316" },
  { name: "Grandmaster", icon: "👑", minXp: 5000, color: "#ef4444" },
];

export interface RankInfo {
  name: string;
  icon: string;
  color: string;
  minXp: number;
  nextMinXp: number | null;
  /** 0..1 progress towards the next rank */
  progress: number;
  level: number;
}

export function getRank(xp: number): RankInfo {
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (xp >= rank.minXp) current = rank;
  }
  const idx = RANKS.indexOf(current);
  const next = RANKS[idx + 1] ?? null;
  const progress = next
    ? Math.min(1, (xp - current.minXp) / (next.minXp - current.minXp))
    : 1;
  const level = Math.min(100, Math.floor(xp / 100) + 1);
  return {
    name: current.name,
    icon: current.icon,
    color: current.color,
    minXp: current.minXp,
    nextMinXp: next ? next.minXp : null,
    progress,
    level,
  };
}

export const XP_AWARDS = {
  MESSAGE: 5,
  TOPIC: 10,
  REPLY: 5,
  LIKE_RECEIVED: 2,
} as const;

export const MESSAGE_COOLDOWN_MS = 1500;
export const MAX_MESSAGE_LENGTH = 400;
export const MAX_TOPIC_TITLE = 120;
export const MAX_TOPIC_CONTENT = 4000;
export const MAX_REPLY_CONTENT = 2000;
