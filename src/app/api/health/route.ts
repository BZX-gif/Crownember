import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * The stethoscope — visit your-site/api/health any time something feels off.
 * It survives even a completely missing DATABASE_URL (dynamic import) and
 * tells you in plain words exactly which wire is loose. No secrets exposed.
 */
export async function GET() {
  const startedAt = Date.now();

  const url = process.env.DATABASE_URL;
  if (!url) {
    return Response.json(
      {
        ok: false,
        db: "missing",
        hint: "DATABASE_URL is not set on Vercel. Add it: Project → Settings → Environment Variables → DATABASE_URL = your Neon pooled connection string (Production ✓) → then Deployments → Redeploy.",
      },
      { status: 500 },
    );
  }

  try {
    // Valid connection string shape — the host itself stays out of responses.
    new URL(url);
  } catch {
    return Response.json(
      {
        ok: false,
        db: "malformed",
        hint: "DATABASE_URL is not a valid connection string. It should start with postgresql:// and contain the -pooler host.",
      },
      { status: 500 },
    );
  }

  try {
    const { db } = await import("@/db");
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
        and column_name in (
          'is_dev','is_bot','founder','strikes','muted_until','banned',
          'avatar_data','avatar_mime','avatar_version'
        )
    `);
    const extra = await db.execute(sql`
      select
        (select count(*)::int from information_schema.columns
         where table_name = 'messages' and column_name = 'reply_to_id') as reply_col,
        (select count(*)::int from information_schema.tables
         where table_name = 'chat_message_reactions') as reaction_table,
        (select count(*)::int from information_schema.columns
         where table_name = 'users'
           and column_name in ('avatar_data','avatar_mime','avatar_version')) as avatar_cols,
        (select count(*)::int from information_schema.tables
         where table_name in ('groups','group_members','group_invitations','group_entitlements')) as group_tables
    `);
    const c = probe.rows[0] as Record<string, number>;
    const e = extra.rows[0] as Record<string, number>;
    const schemaOk =
      Number((cols.rows[0] as Record<string, number>).n) >= 9 &&
      Number(e.reply_col) >= 1 &&
      Number(e.reaction_table) >= 1;
    return Response.json({
      ok: true,
      version: "2.0",
      db: "connected",
      ms: Date.now() - startedAt,
      schema: schemaOk ? "up to date" : "OUTDATED — run the build command again",
      features: {
        profilePictures: Number(e.avatar_cols) >= 3,
        chatReactions: Number(e.reaction_table) >= 1 && Number(e.reply_col) >= 1,
        // Presence only: how many private groups exist is not public information.
        privateGroups: Number(e.group_tables) >= 4,
      },
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
          : "Unknown database error — read the detail below.";
    // `detail` is a short technical fragment for the owner only — never
    // connection strings or credentials (the message can't contain those).
    return Response.json(
      { ok: false, db: "unreachable", hint, detail: msg.slice(0, 160) },
      { status: 500 },
    );
  }
}
