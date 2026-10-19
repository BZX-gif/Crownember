/**
 * One-off remediation for `users.avatar_mime` — OPERATOR ONLY.
 *
 * Before the magic-byte sniff landed, an avatar's stored mime was whatever the
 * browser claimed. Rows written that way can disagree with their bytes. The
 * read path now refuses to serve bytes it cannot identify (404, initials
 * fallback), so nothing unsafe is served either way — this script just repairs
 * the stored label and bumps `avatar_version` so caches refresh.
 *
 * It never deletes an avatar and never writes bytes it did not read.
 *
 * Usage:
 *   npx tsx scripts/fix-avatar-mimes.ts            # report only (dry run)
 *   npx tsx scripts/fix-avatar-mimes.ts --apply    # reclassify
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src/db/index";
import { detectImageMime } from "../src/lib/images";

const apply = process.argv.includes("--apply");

async function main() {
  const rows = await db.execute(
    sql`select id, username, avatar_mime as "avatarMime", avatar_data as "avatarData"
        from users where avatar_data is not null order by id`,
  );

  let mismatched = 0;
  let unservable = 0;

  for (const row of rows.rows as {
    id: number;
    username: string;
    avatarMime: string | null;
    avatarData: Buffer;
  }[]) {
    const detected = detectImageMime(row.avatarData);
    if (!detected) {
      unservable += 1;
      console.log(`#${row.id} ${row.username}: bytes are not a supported image (stored: ${row.avatarMime}) — left untouched, served as 404`);
      continue;
    }
    if (detected === row.avatarMime) continue;
    mismatched += 1;
    console.log(`#${row.id} ${row.username}: stored ${row.avatarMime} → actual ${detected}`);
    if (apply) {
      await db.execute(
        sql`update users set avatar_mime = ${detected}, avatar_version = now() where id = ${row.id}`,
      );
    }
  }

  console.log(
    `${apply ? "fixed" : "found"} ${mismatched} mismatched mime(s), ${unservable} non-image row(s) out of ${rows.rows.length} avatar(s).`,
  );
  if (!apply && mismatched + unservable > 0) {
    console.log("Re-run with --apply to reclassify the mismatched rows.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ fix-avatar-mimes failed:", err?.message ?? err);
  process.exit(1);
});
