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
const REACTION_KEY = "chat_reactions_v2";
const ALLOWED_REACTIONS = ["❤️", "😂", "🔥", "😮", "😢", "😡", "👍", "💀"];

async function findMessage(id: number) {
  const row = await db
    .select({ message: messages, author: users, room: rooms })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .innerJoin(rooms, eq(messages.roomId, rooms.id))
    .where(eq(messages.id, id))
    .limit(1);
  return row[0] ?? null;
}

async function readReactions(): Promise<Record<string, string>> {
  const row = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, REACTION_KEY))
    .limit(1);
  if (!row[0]) return {};
  try {
    const parsed = JSON.parse(row[0].value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeReactions(value: Record<string, string>) {
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
  if (gate) return NextResponse.json({ error: gate.error, code: gate.code, mutedUntil: gate.mutedUntil }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const type = String(body.type ?? "");
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid message." }, { status: 400 });

  const found = await findMessage(id);
  if (!found) return NextResponse.json({ error: "Message no longer exists." }, { status: 404 });

  if (type === "react") {
    const emoji = String(body.emoji ?? "");
    if (!ALLOWED_REACTIONS.includes(emoji)) return NextResponse.json({ error: "Choose a valid reaction." }, { status: 400 });

    const reactions = await readReactions();
    const key = `${found.message.id}:${user.id}`;
    const previous = reactions[key];

    if (previous === emoji) delete reactions[key];
    else reactions[key] = emoji;

    await writeReactions(reactions);

    const counts = Object.fromEntries(ALLOWED_REACTIONS.map((item) => [
      item,
      Object.values(reactions).filter((value) => value === item).length,
    ]));

    return NextResponse.json({ ok: true, counts, selected: previous === emoji ? null : emoji });
  }

  const content = String(body.content ?? "").trim();

  if (type === "edit") {
    if (found.message.userId !== user.id) return NextResponse.json({ error: "You can only edit your own message." }, { status: 403 });
    if (Date.now() - found.message.createdAt.getTime() > EDIT_WINDOW_MS) return NextResponse.json({ error: "Edit window expired. Messages can only be edited for 3 minutes." }, { status: 403 });
    if (!content || content.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ error: `Message must be 1-${MAX_MESSAGE_LENGTH} characters.` }, { status: 400 });
    if (containsInjection(content)) return NextResponse.json({ error: "Messages can't contain code or script tags. 🛡️" }, { status: 400 });
    const [updated] = await db.update(messages).set({ content }).where(and(eq(messages.id, found.message.id), eq(messages.userId, user.id))).returning();
    return NextResponse.json({ ok: true, message: serializeMessage(updated, found.author) });
  }

  if (type === "reply") {
    if (!content || content.length > MAX_MESSAGE_LENGTH - found.author.username.length - 4) return NextResponse.json({ error: "Reply is too long." }, { status: 400 });
    if (containsInjection(content)) return NextResponse.json({ error: "Replies can't contain code or script tags. 🛡️" }, { status: 400 });
    const [created] = await db.insert(messages).values({ roomId: found.room.id, userId: user.id, content: `↩ @${found.author.username}: ${content}` }).returning();
    const [updated] = await db.update(users).set({ xp: user.xp + XP_AWARDS.MESSAGE, lastSeenAt: new Date() }).where(eq(users.id, user.id)).returning();
    return NextResponse.json({ ok: true, message: serializeMessage(created, updated) });
  }

  return NextResponse.json({ error: "Unknown chat action." }, { status: 400 });
}
