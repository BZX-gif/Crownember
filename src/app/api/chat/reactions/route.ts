import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db, pool } from "@/db";
import { rooms } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ messages: {} });

  const roomSlug = new URL(req.url).searchParams.get("room")?.trim() || "global";
  const room = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.slug, roomSlug)).limit(1);
  if (!room[0]) return NextResponse.json({ messages: {} });

  // The reaction table is created by /api/chat/actions when the first action is used.
  // If it does not exist yet, there simply are no reactions to render.
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
      [room[0].id, user.id],
    );

    const messages: Record<string, { counts: Record<string, number>; selected: string | null }> = {};
    for (const row of result.rows) {
      const key = String(row.message_id);
      if (!messages[key]) messages[key] = { counts: {}, selected: null };
      messages[key].counts[String(row.emoji)] = Number(row.count);
      if (row.selected) messages[key].selected = String(row.emoji);
    }

    return NextResponse.json({ messages });
  } catch {
    // Table may not exist until the first POST to /actions.
    return NextResponse.json({ messages: {} });
  }
}
