import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * The stethoscope — visit your-site/api/health any time something feels off.
 * It tells you in plain words whether the deployed site can reach the
 * database, and exactly why not (stale password, missing tables, ...).
 * No secrets are ever exposed.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    const probe = await db.execute(sql`
      select
        (select count(*)::int from rooms) as rooms,
        (select count(*)::int from users) as users,
        (select count(*)::int from messages) as messages,
        (select count(*)::int from topics) as topics,
        (select count(*)::int from users where is_bot = false) as founders,
        (select count(*)::int from users where is_dev) as dev_holders
    `);
    const cols = await db.execute(sql`
      select count(*)::int as n from information_schema.columns
      where table_name = 'users'
        and column_name in ('is_dev','is_bot','founder','strikes','muted_until','banned')
    `);
    const c = probe.rows[0] as Record<string, number>;
    const schemaOk = Number((cols.rows[0] as Record<string, number>).n) >= 6;
    return Response.json({
      ok: true,
      db: "connected",
      ms: Date.now() - startedAt,
      schema: schemaOk ? "up to date" : "OUTDATED — run the build command again",
      counts: c,
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    const hint = /password authentication failed/i.test(msg)
      ? "DATABASE_URL on Vercel has a STALE PASSWORD — update the env variable with the newest Neon connection string, then Redeploy."
      : /column .* does not exist|relation .* does not exist/i.test(msg)
        ? "Database schema is behind the code — make sure the Build Command is: node scripts/migrate.mjs && npx tsx src/db/seed.ts && next build, then Redeploy."
        : /fetch failed|ENOTFOUND|ETIMEDOUT|ECONNREFUSED/i.test(msg)
          ? "Cannot reach the database host — check that DATABASE_URL uses the Neon pooled (-pooler) connection string."
          : "Unknown database error — read the message below.";
    return Response.json(
      {
        ok: false,
        db: "unreachable",
        hint,
        detail: msg.slice(0, 300),
      },
      { status: 500 },
    );
  }
}
