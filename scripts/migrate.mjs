/**
 * VYRON bulletproof build-time migration.
 *
 * Runs BEFORE every deploy (see DEPLOYMENT.md build command). It is fully
 * idempotent — safe to run a hundred times — and uses plain SQL instead of
 * drizzle-kit so it can NEVER get stuck on an interactive prompt in CI.
 *
 * It reconciles ANY schema drift on the production database:
 *   - creates every missing table (including the notifications inbox)
 *   - adds every missing column (e.g. after a rebrand/feature drop)
 *   - recreates missing indexes
 *   - enforces one-like-per-member-per-topic (dedupes history first)
 *   - re-syncs denormalized counters (topic likes / reply counts) to the
 *     actual rows, so displayed counts always reflect underlying data
 *   - reshapes rooms to the live 3-room layout (Global / Lounge / Vault)
 *   - VYRON rebrand, one-time: lifts the legacy 10-seat launch cap so the
 *     platform is open (only fires when the stored cap is exactly the
 *     original launch default; the owner can set any cap via SQL later)
 *   - one-time: refreshes ancient seeded chat timestamps so rooms don't
 *     open empty right after a deploy (only fires when every message is
 *     older than the 3h self-destruct window)
 */
import pg from "pg";
import { SCHEMA_SQL, REFRESH_SQL } from "./migration-sql.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL is not set — cannot migrate.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  await client.query(SCHEMA_SQL);
  const refreshed = await client.query(REFRESH_SQL);
  const counts = await client.query(`
    SELECT
      (SELECT count(*) FROM rooms) AS rooms,
      (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM messages) AS messages,
      (SELECT count(*) FROM topics) AS topics
  `);
  const c = counts.rows[0];
  console.log(
    `✅ migrate: schema reconciled · rooms=${c.rooms} users=${c.users} messages=${c.messages} topics=${c.topics}` +
      (refreshed.rowCount > 0 ? ` · refreshed ${refreshed.rowCount} stale messages` : ""),
  );
  await client.end();
  process.exit(0);
} catch (err) {
  console.error("❌ migrate failed:", err?.message ?? err);
  process.exit(1);
}
