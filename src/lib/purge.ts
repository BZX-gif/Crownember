import { sql } from "drizzle-orm";
import { db } from "@/db";
import { MESSAGE_TTL_MS, VAULT_TTL_MS } from "@/lib/retention";

/**
 * Lazy self-destruct with per-room burn rates:
 *   - vault messages burn after 14 minutes
 *   - everything else burns after 3 hours
 *   - direct messages burn after 3 hours
 *
 * PERF: this used to run two DELETEs on every chat poll and every navbar
 * poll. The whole product shares one Neon connection; that was the single
 * largest source of avoidable database work. It now runs at most once per
 * minute per server instance, with a shared in-flight promise so bursts of
 * chat traffic never queue duplicate sweeps.
 */
const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = 0;
let inFlight: Promise<void> | null = null;

export function purgeExpiredMessages(): Promise<void> {
  const now = Date.now();
  if (inFlight) return inFlight;
  if (now - lastSweep < SWEEP_INTERVAL_MS) return Promise.resolve();

  lastSweep = now;
  inFlight = (async () => {
    const publicCutoff = new Date(now - MESSAGE_TTL_MS);
    const vaultCutoff = new Date(now - VAULT_TTL_MS);
    try {
      await db.execute(sql`
        delete from messages m
        using rooms r
        where m.room_id = r.id
          and (
            m.created_at < ${publicCutoff}
            or (r.is_vault and m.created_at < ${vaultCutoff})
          )
      `);
      await db.execute(sql`
        delete from direct_messages where created_at < ${publicCutoff}
      `);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Test/dev helper — never called by the app. */
export function resetPurgeThrottle() {
  lastSweep = 0;
  inFlight = null;
}
