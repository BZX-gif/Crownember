import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings, users, waitlist } from "@/db/schema";

/**
 * VYRON is open by default.
 *
 * - Registration is unlimited unless the owner deliberately sets a cap in
 *   the `settings` table (key: max_players). The one-time build migration
 *   lifts the legacy Crownember launch cap ('10' → effectively unlimited);
 *   any other owner-chosen value is respected forever.
 * - FOUNDING_LIMIT only decides who carries the 🛡 Founder mark: the first
 *   10 real members ever (bots excluded). It is a badge boundary, not a
 *   registration gate.
 * - If a cap IS set and fills up, registration closes and /register shows
 *   the waitlist gate — the mechanism still works, unchanged.
 */
export const FOUNDING_LIMIT = 10;
export const OPEN_REGISTRATION_LIMIT = 10_000_000;

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
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : OPEN_REGISTRATION_LIMIT;
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
