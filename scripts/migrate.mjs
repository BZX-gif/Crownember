/**
 * VYRON bulletproof build-time migration.
 *
 * Runs BEFORE every deploy (see DEPLOYMENT.md build command). It is fully
 * idempotent — safe to run a hundred times — and uses plain SQL instead of
 * drizzle-kit so it can NEVER get stuck on an interactive prompt in CI.
 *
 * It reconciles ANY schema drift on the production database:
 *   - creates every missing table
 *   - adds every missing column (e.g. after a rebrand/feature drop)
 *   - recreates missing indexes
 *   - marks the Vault room and creates it only when no Vault exists
 *   - adds the private-groups tables (Slice A), guarded by owner/capacity
 *     triggers so the invariants hold even if a write path regresses
 *
 * It never deletes rooms, rewrites room copy, or adjusts message timestamps:
 * community data is not reshaped by a deploy. The SQL itself lives in
 * ./migrations/schema.mjs so it can be reviewed and tested as data.
 *
 * Usage:
 *   node scripts/migrate.mjs              # apply to DATABASE_URL
 *   node scripts/migrate.mjs --dry-run    # print the SQL, touch no database
 */
import pg from "pg";
import { MIGRATION_SQL } from "./migrations/schema.mjs";

const dryRun = process.argv.includes("--dry-run");

if (dryRun) {
  for (const step of MIGRATION_SQL) {
    console.log(`-- ==== ${step.name} ====\n${step.sql}`);
  }
  console.log("✅ migrate: dry run — no database was contacted.");
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL is not set — cannot migrate.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  for (const step of MIGRATION_SQL) {
    await client.query(step.sql);
  }
  const counts = await client.query(`
    SELECT
      (SELECT count(*) FROM rooms) AS rooms,
      (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM messages) AS messages,
      (SELECT count(*) FROM topics) AS topics,
      (SELECT count(*) FROM groups) AS groups,
      (SELECT count(*) FROM group_members) AS group_members
  `);
  const c = counts.rows[0];
  console.log(
    `✅ migrate: schema reconciled · rooms=${c.rooms} users=${c.users} messages=${c.messages} topics=${c.topics} groups=${c.groups} group_members=${c.group_members}`,
  );
  await client.end();
  process.exit(0);
} catch (err) {
  console.error("❌ migrate failed:", err?.message ?? err);
  process.exit(1);
}
