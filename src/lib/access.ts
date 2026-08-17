import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings, users, waitlist } from "@/db/schema";

/**
 * EMBERCROWN launches as an exclusive 10-player "Founding Squad".
 * - The first 10 REAL players (bots excluded) claim the founding seats.
 * - After that, registration closes and a waitlist opens.
 * - The cap lives in the `settings` table (key: max_players) so it can
 *   be raised later without code changes.
 */
export const FOUNDING_LIMIT = 10;

export interface SeatStats {
  max: number;
  taken: number;
  left: number;
  open: boolean;
  waitlistCount: number;
}

export async function getMaxPlayers(): Promise<number> {
  const rows = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "max_players"))
    .limit(1);
  const parsed = Number(rows[0]?.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FOUNDING_LIMIT;
}

export async function getSeatStats(): Promise<SeatStats> {
  const [max, counts] = await Promise.all([
    getMaxPlayers(),
    db.execute(sql`
      select
        (select count(*)::int from users where is_bot = false) as taken,
        (select count(*)::int from waitlist) as waitlist
    `),
  ]);
  const row = counts.rows[0] as unknown as { taken: number; waitlist: number };
  const taken = Number(row?.taken ?? 0);
  return {
    max,
    taken,
    left: Math.max(0, max - taken),
    open: taken < max,
    waitlistCount: Number(row?.waitlist ?? 0),
  };
}

/** Seat number a new player would claim (1-based), or null when full. */
export async function nextSeatNumber(): Promise<number | null> {
  const stats = await getSeatStats();
  return stats.open ? stats.taken + 1 : null;
}
