export interface Rank {
  name: string;
  icon: string;
  minXp: number;
  color: string;
}

/**
 * The VYRON reputation ladder — driven entirely by server-awarded XP.
 * Thresholds are unchanged from the platform's first day; only the names
 * grew up. Monochrome by design: rank is meaning, not decoration.
 */
export const RANKS: Rank[] = [
  { name: "Newcomer", icon: "○", minXp: 0, color: "#71717a" },
  { name: "Regular", icon: "◔", minXp: 250, color: "#a1a1aa" },
  { name: "Known", icon: "◑", minXp: 500, color: "#d4d4d4" },
  { name: "Established", icon: "◕", minXp: 1000, color: "#e4e4e7" },
  { name: "Renowned", icon: "●", minXp: 1800, color: "#f4f4f5" },
  { name: "Icon", icon: "✦", minXp: 3000, color: "#fafafa" },
  { name: "Legend", icon: "✷", minXp: 5000, color: "#ffffff" },
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
