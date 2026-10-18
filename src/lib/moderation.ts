import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * VYRON GUARD — server-side abuse enforcement.
 *
 * The ladder:
 *   strike 1 → warning 1 of 3 (message blocked)
 *   strike 2 → warning 2 of 3 (message blocked)
 *   strike 3 → muted from messaging for 2 hours
 *   strike 4 → permanently suspended — login refused, sessions destroyed
 *
 * Strikes decay after 24h of clean behavior. All detection happens on the
 * server, so it cannot be bypassed from the browser.
 */

export const MUTE_HOURS = 2;
export const STRIKE_DECAY_MS = 24 * 60 * 60 * 1000;

/** Whole-token matches (safe for very short abbreviations). */
const EXACT_TOKENS = new Set([
  // Hindi abbreviations
  "mkc", "bkl", "bc", "mc", "mbc", "bnc", "bsdk", "mdc", "gnd",
  "chut", "chodu", "chinal",
  "lodu", "loda", "lauda", "laude", "gandu", "gaandu",
  "bhosda", "bhosdike", "randi", "randwa",
  "bhadwa", "bhadwe", "kutta", "kutti", "kamine", "kamino", "kameena",
  "suar", "suali",
  // English short forms
  "fck", "fuk", "mf",
]);

/** Substring stems for longer words and their variants. */
const STEMS = [
  "chuti", "chod", "chud",
  "bhosd", "madarch", "madarx", "mdrch", "behench", "bhench",
  "haramkhor", "kutti",
  "fuck", "fucker", "motherfuck",
  "shit", "shithead",
  "bitch", "asshole", "arsehole", "bastard",
  "slut", "whore", "cunt", "dick", "puss",
  "nigg", "retard", "wanker", "twat",
];

const LEET_MAP: Record<string, string> = {
  "1": "i", "0": "o", "3": "e", "4": "a", "5": "s", "7": "t",
  "@": "a", $: "s",
};

/** Per-word normalization: leet-map, then drop everything non-alphabetic.
 *  "b.c" → "bc", "ChUt1yE!" → "chutiye", "b!c" → "bc" */
function normalizeWord(word: string): string {
  let out = "";
  for (const ch of word.toLowerCase()) {
    const mapped = LEET_MAP[ch] ?? ch;
    if (mapped >= "a" && mapped <= "z") out += mapped;
  }
  return out;
}

/** Space-splitting defeat only for deliberate abbreviations — keeps
 *  innocent joins like "each utensil" or "album cover" safe. */
const FLAT_TOKENS = [
  "mkc", "bkl", "bsdk", "mbc", "bnc", "mdc", "gnd", "fck", "fuk",
  "lodu", "lauda", "gandu", "gaandu", "randi", "bhadwa", "kutta",
  "kamine", "bhosda",
];

/** Returns the matched term, or null when the text is clean. */
export function detectAbuse(raw: string): string | null {
  const tokens = raw
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);
  if (tokens.length === 0) return null;

  for (const t of tokens) {
    if (EXACT_TOKENS.has(t)) return t;
  }
  for (const t of tokens) {
    for (const stem of STEMS) {
      if (t.includes(stem)) return stem;
    }
  }
  // Defeats "m k c" / "b k l" space-splitting
  const flat = tokens.join("");
  for (const t of FLAT_TOKENS) {
    if (flat.includes(t)) return t;
  }
  return null;
}

export type AbuseCode = "STRIKE_1" | "STRIKE_2" | "MUTED" | "BANNED_PERM";

export interface AbuseVerdict {
  ok: boolean;
  code?: AbuseCode;
  error?: string;
  mutedUntil?: Date;
}

type UserRow = typeof users.$inferSelect;

/** Rejects muted / banned users before their content is even considered. */
export function gateVerdict(user: UserRow): AbuseVerdict | null {
  if (user.banned) {
    return {
      ok: false,
      code: "BANNED_PERM",
      error:
        "This account has been permanently suspended from VYRON.",
    };
  }
  if (user.mutedUntil && user.mutedUntil.getTime() > Date.now()) {
    return {
      ok: false,
      code: "MUTED",
      error:
        "You are muted. Messaging unlocks when the timer ends.",
      mutedUntil: user.mutedUntil,
    };
  }
  return null;
}

/**
 * Applies the judgement ladder when abuse is detected.
 * The offending message is NEVER posted.
 */
export async function enforceAbuseRule(
  user: UserRow,
  text: string,
): Promise<AbuseVerdict> {
  const matched = detectAbuse(text);
  if (!matched) return { ok: true };

  const now = new Date();
  // Clean for 24h? The surveillance file gets shredded — fresh start.
  const decayed =
    user.lastStrikeAt !== null &&
    now.getTime() - user.lastStrikeAt.getTime() > STRIKE_DECAY_MS;
  const strikes = (decayed ? 0 : user.strikes) + 1;

  if (strikes === 1) {
    await db
      .update(users)
      .set({ strikes, lastStrikeAt: now })
      .where(eq(users.id, user.id));
    return {
      ok: false,
      code: "STRIKE_1",
      error:
        "Message blocked for abusive language. Warning 1 of 3 — it stays civil here.",
    };
  }

  if (strikes === 2) {
    await db
      .update(users)
      .set({ strikes, lastStrikeAt: now })
      .where(eq(users.id, user.id));
    return {
      ok: false,
      code: "STRIKE_2",
      error:
        "Message blocked. Warning 2 of 3 — the next one mutes you for 2 hours.",
    };
  }

  if (strikes === 3) {
    const mutedUntil = new Date(now.getTime() + MUTE_HOURS * 60 * 60 * 1000);
    await db
      .update(users)
      .set({ strikes, lastStrikeAt: now, mutedUntil })
      .where(eq(users.id, user.id));
    return {
      ok: false,
      code: "MUTED",
      error: `Muted for ${MUTE_HOURS} hours (warning 3 of 3). One more and the account is suspended.`,
      mutedUntil,
    };
  }

  // Strike 4+: they came back and did it again. Permanent exile.
  await db
    .update(users)
    .set({
      strikes,
      lastStrikeAt: now,
      banned: true,
      mutedUntil: null,
    })
    .where(eq(users.id, user.id));
  // Destroy every live session so the exile is immediate.
  await db.execute(
    sql`delete from sessions where user_id = ${user.id}`,
  );
  return {
    ok: false,
    code: "BANNED_PERM",
    error:
      "This account has been permanently suspended from VYRON.",
  };
}
