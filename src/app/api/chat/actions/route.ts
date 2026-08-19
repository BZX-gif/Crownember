import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages, rooms, settings, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { containsInjection } from "@/lib/antibot";
import { gateVerdict } from "@/lib/moderation";
import { MAX_MESSAGE_LENGTH, XP_AWARDS } from "@/lib/ranks";
import { serializeMessage } from "@/lib/utils";

const EDIT_WINDOW_MS = 3 * 60 * 1000;
const REACTION_KEY = "chat_reactions_v1";

async function findMessage(roomSlug: string, username: string, content: string) {
  const room = await db.select().from(rooms).where(eq(rooms.slug, roomSlug)).limit(1);
  if (!room[0]) return null;
  const author = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!author[0]) return null;
  const row = await db
    .select({ message: messages, author: users })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(and(eq(messages.roomId, room[0].id), eq(messages.userId, author[0].id), eq(messages.content, content)))
    .orderBy(desc(messages.id))
    .limit(1);
  return row[0] ? { ...row[0], room: room[0] } : null;
}

async function readReactions(): Promise<Record<string, number>> {
  const row = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, REACTION_KEY)).limit(1);
  if (!row[0]) return {};
  try {
    const parsed = JSON.parse(row[0].value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeReactions(value: Record<string, number>) {
  const encoded = JSON.stringify(value);
  await db.insert(settings).values({ key: REACTION_KEY, value: encoded }).onConflictDoUpdate({
    target: settings.key,
    set: { value: encoded },
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });

  const gate = gateVerdict(user);
  if (gate) {
    return NextResponse.json({ error: gate.error, code: gate.code, mutedUntil: gate.mutedUntil }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const type = String(body.type ?? "");
  const roomSlug = String(body.room ?? "").trim();
  const username = String(body.username ?? "").trim();
  const message = String(body.message ?? "").trim();
  const content = String(body.content ?? "").trim();
  if (!roomSlug || !username || !message) return NextResponse.json({ error: "Missing message information." }, { status: 400 });

  const found = await findMessage(roomSlug, username, message);
  if (!found) return NextResponse.json({ error: "Message no longer exists." }, { status: 404 });

  if (type === "react") {
    const reactions = await readReactions();
    const key = `${found.message.id}:${user.id}`;
    reactions[key] = reactions[key] ? 0 : 1;
    await writeReactions(reactions);
    const count = Object.entries(reactions).filter(([k, value]) => k.startsWith(`${found.message.id}:`) && value === 1).length;
    return NextResponse.json({ ok: true, count, message: "❤️ Reaction saved." });
  }

  if (type === "edit") {
    if (found.message.userId !== user.id) return NextResponse.json({ error: "You can only edit your own message." }, { status: 403 });
    if (Date.now() - found.message.createdAt.getTime() > EDIT_WINDOW_MS) {
      return NextResponse.json({ error: "Edit window expired. Messages can only be edited for 3 minutes." }, { status: 403 });
    }
    if (!content || content.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ error: `Message must be 1-${MAX_MESSAGE_LENGTH} characters.` }, { status: 400 });
    if (containsInjection(content)) return NextResponse.json({ error: "Messages can't contain code or script tags. 🛡️" }, { status: 400 });
    const [updated] = await db.update(messages).set({ content }).where(eq(messages.id, found.message.id)).returning();
    return NextResponse.json({ ok: true, message: serializeMessage(updated, found.author) });
  }

  if (type === "reply") {
    if (!content || content.length > MAX_MESSAGE_LENGTH - username.length - 4) return NextResponse.json({ error: "Reply is too long." }, { status: 400 });
    if (containsInjection(content)) return NextResponse.json({ error: "Replies can't contain code or script tags. 🛡️" }, { status: 400 });
    const [created] = await db.insert(messages).values({ roomId: found.room.id, userId: user.id, content: `↩ @${username}: ${content}` }).returning();
    const [updated] = await db.update(users).set({ xp: user.xp + XP_AWARDS.MESSAGE, lastSeenAt: new Date() }).where(eq(users.id, user.id)).returning();
    return NextResponse.json({ ok: true, message: serializeMessage(created, updated) });
  }

  return NextResponse.json({ error: "Unknown chat action." }, { status: 400 });
}
