/**
 * VYRON reputation ladder.
 *
 * XP is still awarded exactly as before (messages, topics, replies and
 * received likes), so no member's history changes. Only the presentation
 * changed: the old game-rank names (Bronze → Grandmaster) and emoji medals
 * were Free Fire holdovers. These names describe contribution on a social
 * platform and render as a restrained monochrome glyph.
 */
export interface Rank {
  name: string;
  minXp: number;
  tier: number;
}

export const RANKS: Rank[] = [
  { name: "Member", minXp: 0, tier: 1 },
  { name: "Contributor", minXp: 250, tier: 2 },
  { name: "Voice", minXp: 500, tier: 3 },
  { name: "Editor", minXp: 1000, tier: 4 },
  { name: "Curator", minXp: 1800, tier: 5 },
  { name: "Luminary", minXp: 3000, tier: 6 },
  { name: "Icon", minXp: 5000, tier: 7 },
];

export interface RankInfo {
  name: string;
  minXp: number;
  nextMinXp: number | null;
  /** 0..1 progress towards the next rank */
  progress: number;
  level: number;
  tier: number;
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
    minXp: current.minXp,
    nextMinXp: next ? next.minXp : null,
    progress,
    level,
    tier: current.tier,
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
