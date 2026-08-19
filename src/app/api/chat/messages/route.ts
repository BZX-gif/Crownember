import { and, desc, eq, gt, gte, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages, rooms, settings, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { containsInjection } from "@/lib/antibot";
import { detectAbuse, enforceAbuseRule, gateVerdict } from "@/lib/moderation";
import { purgeExpiredMessages } from "@/lib/purge";
import { messageCutoff } from "@/lib/retention";
import { getHiddenUserIds } from "@/lib/social";
import { getVaultUser } from "@/lib/vault";
import { MAX_MESSAGE_LENGTH, MESSAGE_COOLDOWN_MS, XP_AWARDS } from "@/lib/ranks";
import { checkRateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { serializeMessage } from "@/lib/utils";

const REACTION_KEY = "chat_reactions_v2";
const ALLOWED_REACTIONS = ["❤️", "😂", "🔥", "😮", "😢", "😡", "👍", "💀"];

type ReactionMap = Record<string, string>;

async function readReactions(): Promise<ReactionMap> {
  const row = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, REACTION_KEY)).limit(1);
  if (!row[0]) return {};
  try {
    const parsed: unknown = JSON.parse(row[0].value);
    return parsed && typeof parsed === "object" ? (parsed as ReactionMap) : {};
  } catch {
    return {};
  }
}

function reactionData(reactions: ReactionMap, messageId: number, userId?: number | null) {
  const prefix = `${messageId}:`;
  const counts = Object.fromEntries(
    ALLOWED_REACTIONS.map((emoji) => [
      emoji,
      Object.entries(reactions).filter(([key, value]) => key.startsWith(prefix) && value === emoji).length,
    ]),
  );
  const selected = userId ? reactions[`${messageId}:${userId}`] ?? null : null;
  return { counts, selected };
}

async function getOnlineCounts(roomId: number) {
  const [globalOnline, roomOnline] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(users).where(gte(users.lastSeenAt, new Date(Date.now() - 60_000))),
    db.select({ n: sql<number>`count(distinct ${messages.userId})::int` }).from(messages).where(and(eq(messages.roomId, roomId), gte(messages.createdAt, new Date(Date.now() - 3 * 60_000)))),
  ]);
  return { global: Number(globalOnline[0]?.n ?? 0), room: Number(roomOnline[0]?.n ?? 0) };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const roomSlug = url.searchParams.get("room") ?? "";
  const after = Math.max(0, Number(url.searchParams.get("after") ?? "0") || 0);

  const roomRows = await db.select().from(rooms).where(eq(rooms.slug, roomSlug)).limit(1);
  const room = roomRows[0];
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  if (room.isVault && !(await getVaultUser())) {
    return NextResponse.json({ error: "The Vault is sealed. 🔐" }, { status: 403 });
  }

  const user = await getSessionUser();
  const queries: Promise<unknown>[] = [
    purgeExpiredMessages(),
    db.select({ message: messages, author: users }).from(messages).innerJoin(users, eq(messages.userId, users.id)).where(and(eq(messages.roomId, room.id), gt(messages.id, after), gte(messages.createdAt, messageCutoff(room.isVault)))).orderBy(desc(messages.id)).limit(60),
    getOnlineCounts(room.id),
  ];
  if (user) queries.push(db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id)));

  const [, messageRows, online] = await Promise.all(queries);
  const rows = (messageRows as { message: typeof messages.$inferSelect; author: typeof users.$inferSelect }[]).reverse();

  const purgedIds: number[] = [];
  for (const r of rows) if (detectAbuse(r.message.content)) purgedIds.push(r.message.id);
  if (purgedIds.length > 0) await db.delete(messages).where(inArray(messages.id, purgedIds));

  const hidden = user ? await getHiddenUserIds(user.id) : new Set<number>();
  const live = rows.filter((r) => !purgedIds.includes(r.message.id) && !hidden.has(r.author.id));
  const reactions = await readReactions();

  return NextResponse.json({
    messages: live.map((r) => ({
      ...serializeMessage(r.message, r.author),
      reactions: reactionData(reactions, r.message.id, user?.id),
    })),
    purgedIds,
    online,
    me: user ? { strikes: user.strikes, mutedUntil: user.mutedUntil, banned: user.banned, dev: user.isDev } : null,
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "You must be logged in to chat." }, { status: 401 });

  const gate = gateVerdict(user);
  if (gate) return NextResponse.json({ error: gate.error, code: gate.code, mutedUntil: gate.mutedUntil }, { status: 403 });

  const ip = clientIp(req);
  const rl = checkRateLimit(`messages:${ip}:${user.id}`, 8, 10_000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "messages");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const roomSlug = String(body.room ?? "").trim();
  const content = String(body.content ?? "").trim();
  if (!content || content.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ error: `Message must be 1-${MAX_MESSAGE_LENGTH} characters.` }, { status: 400 });
  if (containsInjection(content)) return NextResponse.json({ error: "Messages can't contain code or script tags. 🛡️" }, { status: 400 });

  const verdict = await enforceAbuseRule(user, content);
  if (!verdict.ok) return NextResponse.json({ error: verdict.error, code: verdict.code, mutedUntil: verdict.mutedUntil }, { status: 403 });

  const roomRows = await db.select().from(rooms).where(eq(rooms.slug, roomSlug)).limit(1);
  const room = roomRows[0];
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (room.isVault && !(await getVaultUser())) return NextResponse.json({ error: "The Vault is sealed. 🔐" }, { status: 403 });

  const lastMessage = await db.select({ createdAt: messages.createdAt, content: messages.content }).from(messages).where(and(eq(messages.userId, user.id), eq(messages.roomId, room.id))).orderBy(desc(messages.id)).limit(1);
  if (lastMessage[0] && Date.now() - lastMessage[0].createdAt.getTime() < MESSAGE_COOLDOWN_MS) return NextResponse.json({ error: "Chill out! You're chatting too fast (1.5s cooldown)." }, { status: 429 });
  if (lastMessage[0]?.content === content) return NextResponse.json({ error: "You just said that! Mix it up 🔁" }, { status: 429 });

  const [created] = await db.insert(messages).values({ roomId: room.id, userId: user.id, content }).returning();
  void purgeExpiredMessages();
  const [updated] = await db.update(users).set({ xp: sql`${users.xp} + ${XP_AWARDS.MESSAGE}`, lastSeenAt: new Date() }).where(eq(users.id, user.id)).returning();

  return NextResponse.json({ message: { ...serializeMessage(created, updated), reactions: reactionData({}, created.id, user.id) }, xpGained: XP_AWARDS.MESSAGE });
}
