import { and, asc, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages, rooms, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { messageCutoff } from "@/lib/retention";

const ALLOWED = ["❤️", "😂", "🔥", "😮", "😢", "😡", "👍", "💀"] as const;

async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS message_reactions (
      id serial PRIMARY KEY,
      message_id integer NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (message_id, user_id, emoji)
    );
    CREATE INDEX IF NOT EXISTS message_reactions_message_idx ON message_reactions(message_id);
  `);
}

export async function GET(req: Request) {
  await ensureTable();
  const roomSlug = new URL(req.url).searchParams.get("room") ?? "";
  const room = (await db.select().from(rooms).where(eq(rooms.slug, roomSlug)).limit(1))[0];
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const user = await getSessionUser();
  const live = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.roomId, room.id), gte(messages.createdAt, messageCutoff(room.isVault))))
    .orderBy(asc(messages.id))
    .limit(60);
  if (!live.length) return NextResponse.json({ messages: [] });

  const ids = sql.join(live.map((m) => sql`${m.id}`), sql`, `);
  const rows = await db.execute(sql`
    SELECT message_id, emoji, count(*)::int AS count
    FROM message_reactions
    WHERE message_id IN (${ids})
    GROUP BY message_id, emoji
  `);
  const mine = user
    ? await db.execute(sql`SELECT message_id, emoji FROM message_reactions WHERE user_id=${user.id} AND message_id IN (${ids})`)
    : { rows: [] };

  const out: Record<string, { counts: Record<string, number>; selected: string | null }> = {};
  for (const m of live) out[String(m.id)] = { counts: {}, selected: null };
  for (const r of rows.rows as { message_id: number; emoji: string; count: number }[]) {
    out[String(r.message_id)].counts[r.emoji] = Number(r.count);
  }
  for (const r of mine.rows as { message_id: number; emoji: string }[]) {
    out[String(r.message_id)].selected = r.emoji;
  }
  return NextResponse.json({ messages: out });
}

export async function POST(req: Request) {
  await ensureTable();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const messageId = Number(body.messageId);
  const emoji = String(body.emoji ?? "");
  if (!Number.isInteger(messageId) || messageId <= 0 || !ALLOWED.includes(emoji as (typeof ALLOWED)[number])) {
    return NextResponse.json({ error: "Invalid reaction." }, { status: 400 });
  }
  const target = (await db.select({ id: messages.id }).from(messages).where(eq(messages.id, messageId)).limit(1))[0];
  if (!target) return NextResponse.json({ error: "Message no longer exists." }, { status: 404 });

  const existing = await db.execute(sql`
    SELECT id FROM message_reactions
    WHERE message_id=${messageId} AND user_id=${user.id} AND emoji=${emoji}
    LIMIT 1
  `);
  if (existing.rows.length) {
    await db.execute(sql`DELETE FROM message_reactions WHERE id=${Number((existing.rows[0] as { id: number }).id)}`);
    return NextResponse.json({ reacted: false });
  }
  await db.execute(sql`
    INSERT INTO message_reactions(message_id,user_id,emoji)
    VALUES(${messageId},${user.id},${emoji})
    ON CONFLICT(message_id,user_id,emoji) DO NOTHING
  `);
  return NextResponse.json({ reacted: true });
}
