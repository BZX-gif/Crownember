import { eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { AuthUser } from "@/lib/auth";

/**
 * Developer perk — single source of truth: users.is_dev.
 *
 * The owner grants it directly in the database:
 *   update users set is_dev = (username = 'PlayerName');
 * (one line: crowns that player, uncrowns everyone else)
 *
 * Founders can also claim it in-app; first claim wins until the owner
 * moves the crown via SQL.
 */
export async function claimDevFlair(
  user: AuthUser,
): Promise<{ ok: boolean; error?: string }> {
  if (!user.founder) {
    return {
      ok: false,
      error: "Only the 🛡️ Founding Squad can claim the Developer Crown.",
    };
  }

  if (!user.isDev) {
    const holders = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isDev, true))
      .limit(1);
    if (holders[0] && holders[0].id !== user.id) {
      return {
        ok: false,
        error:
          "⚡ The Developer Crown is already claimed. One builder, one signature.",
      };
    }
  }

  // Crown the claimant, uncrown everyone else — one signature at a time.
  await db
    .update(users)
    .set({ isDev: sql`${users.id} = ${user.id}` })
    .where(sql`true`);
  return { ok: true };
}
