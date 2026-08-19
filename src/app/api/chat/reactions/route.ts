import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages, rooms, settings } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { messageCutoff } from "@/lib/retention";

const REACTION_KEY = "chat_reactions_v2";
const ALLOWED = ["❤️", "😂", "🔥", "😮", "😢", "😡", "👍", "💀"];

export async function GET(req: Request) {
  const roomSlug = new URL(req.url).searchParams.get("room") ?? "";
  const room = (await db.select().from(rooms).where(eq(rooms.slug, roomSlug)).limit(1))[0];
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  const user = await getSessionUser();
  const rows = await db.select({ id: messages.id }).from(messages).where(eq(messages.roomId, room.id)).orderBy(desc(messages.id)).limit(200);
  const setting = (await db.select({ value: settings.value }).from(settings).where(eq(settings.key, REACTION_KEY)).limit(1))[0];
  let stored: Record<string, string> = {};
  try {
    const parsed = setting ? JSON.parse(setting.value) : {};
    if (parsed && typeof parsed === "object") stored = parsed;
  } catch {}
  const result: Record<string, { counts: Record<string, number>; selected: string | null }> = {};
  for (const row of rows) {
    const counts = Object.fromEntries(ALLOWED.map((emoji) => [emoji, 0]));
    for (const [key, emoji] of Object.entries(stored)) {
      if (key.startsWith(`${row.id}:`) && ALLOWED.includes(emoji)) counts[emoji] += 1;
    }
    result[String(row.id)] = { counts, selected: user ? stored[`${row.id}:${user.id}`] ?? null : null };
  }
  return NextResponse.json({ messages: result });
}
