import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, pool } from "@/db";
import { messages, rooms } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { MAX_MESSAGE_LENGTH } from "@/lib/ranks";
import { containsInjection } from "@/lib/antibot";
import { getVaultUser } from "@/lib/vault";

const REACTIONS = new Set(["❤️", "😂", "🔥", "😮", "😢", "😡", "👍", "💀"]);

async function ensureChatActionTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_message_reactions (
      id SERIAL PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(message_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS chat_message_reactions_message_idx
      ON chat_message_reactions(message_id);
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER;
    CREATE INDEX IF NOT EXISTS messages_reply_to_idx ON messages(reply_to_id);
  `);
}

async function getRoom(roomSlug: string) {
  const rows = await db.select().from(rooms).where(eq(rooms.slug, roomSlug)).limit(1);
  return rows[0] ?? null;
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const type = String(body.type ?? "");
  const id = Number(body.id);
  const roomSlug = String(body.room ?? "").trim();
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid message." }, { status: 400 });

  const room = await getRoom(roomSlug);
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (room.isVault && !(await getVaultUser())) return NextResponse.json({ error: "The Vault is sealed. 🔐" }, { status: 403 });

  await ensureChatActionTables();

  const target = await db.select().from(messages).where(and(eq(messages.id, id), eq(messages.roomId, room.id))).limit(1);
  const message = target[0];
  if (!message) return NextResponse.json({ error: "Message no longer exists." }, { status: 404 });

  if (type === "react") {
    const emoji = String(body.emoji ?? "");
    if (!REACTIONS.has(emoji)) return NextResponse.json({ error: "Unsupported reaction." }, { status: 400 });

    const existing = await pool.query(
      `SELECT id, emoji FROM chat_message_reactions WHERE message_id = $1 AND user_id = $2 LIMIT 1`,
      [id, user.id],
    );
    if (existing.rows[0]?.emoji === emoji) {
      await pool.query(`DELETE FROM chat_message_reactions WHERE id = $1`, [existing.rows[0].id]);
    } else if (existing.rows[0]) {
      await pool.query(`UPDATE chat_message_reactions SET emoji = $1, created_at = NOW() WHERE id = $2`, [emoji, existing.rows[0].id]);
    } else {
      await pool.query(`INSERT INTO chat_message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)`, [id, user.id, emoji]);
    }
    return NextResponse.json({ ok: true });
  }

  const content = String(body.content ?? "").trim();
  if (!content || content.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ error: `Message must be 1-${MAX_MESSAGE_LENGTH} characters.` }, { status: 400 });
  if (containsInjection(content)) return NextResponse.json({ error: "Messages can't contain code or script tags. 🛡️" }, { status: 400 });

  if (type === "edit") {
    if (message.userId !== user.id) return NextResponse.json({ error: "You can only edit your own messages." }, { status: 403 });
    await db.update(messages).set({ content }).where(eq(messages.id, id));
    return NextResponse.json({ ok: true });
  }

  if (type === "reply") {
    const [created] = await db.insert(messages).values({
      roomId: room.id,
      userId: user.id,
      content: `↩ ${message.content.slice(0, 120)}\n${content}`,
    }).returning();
    await pool.query(`UPDATE messages SET reply_to_id = $1 WHERE id = $2`, [id, created.id]);
    return NextResponse.json({ ok: true, messageId: created.id });
  }

  return NextResponse.json({ error: "Unknown chat action." }, { status: 400 });
}
