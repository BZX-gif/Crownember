import { sql } from "drizzle-orm";
import { db } from "@/db";
import { MESSAGE_TTL_MS, VAULT_TTL_MS } from "@/lib/retention";

/**
 * Lazy self-destruct with per-room burn rates:
 *   - vault messages burn after 15 minutes
 *   - everything else burns after 3 hours
 * Piggybacks on chat API traffic — no cron jobs or paid workers needed.
 * SERVER ONLY — never import from client components.
 */
export async function purgeExpiredMessages(): Promise<void> {
  const publicCutoff = new Date(Date.now() - MESSAGE_TTL_MS);
  const vaultCutoff = new Date(Date.now() - VAULT_TTL_MS);
  await db.execute(sql`
    delete from messages m
    using rooms r
    where m.room_id = r.id
      and (
        m.created_at < ${publicCutoff}
        or (r.is_vault and m.created_at < ${vaultCutoff})
      )
  `);
}
