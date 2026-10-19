import { and, desc, eq, gt, gte, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { messages, users } from "@/db/schema";
import { messageCutoff } from "@/lib/retention";

export interface ReactionState {
  counts: Record<string, number>;
  selected: string | null;
}

/**
 * One room read path, shared by the server-rendered first paint and the
 * polling API. Bot-authored messages are excluded at the query level so the
 * interface never presents seeded content as community activity.
 */
export async function getRoomMessages(
  roomId: number,
  isVault: boolean,
  after = 0,
  limit = 60,
) {
  const rows = await db
    .select({ message: messages, author: users })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(
      and(
        eq(messages.roomId, roomId),
        eq(users.isBot, false),
        gt(messages.id, after),
        gte(messages.createdAt, messageCutoff(isVault)),
      ),
    )
    .orderBy(desc(messages.id))
    .limit(limit);
  return rows.reverse();
}

/**
 * Reactions live in a table created by the idempotent migration (and lazily
 * by the action endpoint). Until that has run on an old deployment the table
 * may be absent; a missing table simply means "no reactions", never a crash.
 */
export async function getRoomReactions(
  roomId: number,
  userId: number | null,
): Promise<Record<string, ReactionState>> {
  try {
    const result = await pool.query(
      `
      SELECT r.message_id, r.emoji, COUNT(*)::int AS count,
             BOOL_OR(r.user_id = $2) AS selected
      FROM chat_message_reactions r
      JOIN messages m ON m.id = r.message_id
      WHERE m.room_id = $1
      GROUP BY r.message_id, r.emoji
      ORDER BY r.message_id ASC
      `,
      [roomId, userId ?? -1],
    );
    const reactions: Record<string, ReactionState> = {};
    for (const row of result.rows as Array<{
      message_id: number;
      emoji: string;
      count: number;
      selected: boolean;
    }>) {
      const key = String(row.message_id);
      if (!reactions[key]) reactions[key] = { counts: {}, selected: null };
      reactions[key].counts[String(row.emoji)] = Number(row.count);
      if (row.selected) reactions[key].selected = String(row.emoji);
    }
    return reactions;
  } catch {
    return {};
  }
}

/** Distinct real members who spoke in this room in the last three minutes. */
export async function getRoomOnlineCount(roomId: number): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(distinct ${messages.userId})::int` })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(
      and(
        eq(messages.roomId, roomId),
        eq(users.isBot, false),
        gte(messages.createdAt, new Date(Date.now() - 3 * 60_000)),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}
