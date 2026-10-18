/**
 * VYRON — owner-run account recovery (zero cost, no email provider).
 *
 * There is intentionally NO self-serve "forgot password" flow: with no email
 * service budget, any such flow would be insecure guesswork. Instead, the
 * owner can reset a player's password directly and safely:
 *
 *   NEW_PASSWORD='a-strong-new-password' npx tsx scripts/reset-password.ts <username>
 *
 * Safety rules this script follows:
 * - The new password is read from the NEW_PASSWORD env var only — it is
 *   never accepted as a CLI argument (arguments leak into shell history and
 *   process listings), and it is never printed.
 * - Only the scrypt hash is written to the database.
 * - Every existing session for that account is destroyed, so the reset
 *   logs the account out everywhere.
 *
 * Prerequisite: DATABASE_URL (the Neon pooled connection string).
 */
import "dotenv/config";
import pg from "pg";
import { hashPassword } from "../src/lib/password";

const username = process.argv[2]?.trim();
const newPassword = process.env.NEW_PASSWORD ?? "";

if (!username || !/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
  console.error(
    "Usage: NEW_PASSWORD='...' npx tsx scripts/reset-password.ts <username>",
  );
  process.exit(1);
}
if (newPassword.length < 8 || newPassword.length > 128) {
  console.error(
    "NEW_PASSWORD must be 8-128 characters (set it as an env var, not an argument).",
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();

  const found = await client.query(
    `select id, is_bot from users where lower(username) = lower($1) limit 1`,
    [username],
  );
  const user = found.rows[0];
  if (!user) {
    console.error(`No player named "${username}".`);
    process.exit(1);
  }
  if (user.is_bot) {
    console.error("Bot accounts never log in — nothing to reset.");
    process.exit(1);
  }

  await client.query(`update users set password_hash = $1 where id = $2`, [
    hashPassword(newPassword),
    user.id,
  ]);
  await client.query(`delete from sessions where user_id = $1`, [user.id]);

  console.log(
    `✅ Password reset for "${username}". All existing sessions were logged out. The new password was not printed.`,
  );
  await client.end();
}

main().catch((err) => {
  console.error("Reset failed:", err?.message ?? err);
  process.exit(1);
});
