import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages, rooms, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { containsInjection } from "@/lib/antibot";
import { getRoomMessages, getRoomOnlineCount, getRoomReactions } from "@/lib/chat";
import {
  detectAbuse,
  enforceAbuseRule,
  gateVerdict,
} from "@/lib/moderation";
import { purgeExpiredMessages } from "@/lib/purge";
import { XP_AWARDS, MESSAGE_COOLDOWN_MS, MAX_MESSAGE_LENGTH } from "@/lib/ranks";
import { checkRateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { getHiddenUserIds } from "@/lib/social";
import { getVaultUser } from "@/lib/vault";
import { serializeMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Presence writes are useful for "here now" counts but were previously a
 * database UPDATE on every 3s poll. Once a minute is enough for a 60s window
 * and removes almost all write traffic from chat.
 */
const presence = new Map<number, number>();
function touchPresence(userId: number) {
  const now = Date.now();
  const last = presence.get(userId) ?? 0;
  if (now - last < 60_000) return;
  presence.set(userId, now);
  void db
    .update(users)
    .set({ lastSeenAt: new Date() })
    .where(eq(users.id, userId))
    .catch(() => undefined);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const roomSlug = url.searchParams.get("room") ?? "";
  const after = Math.max(0, Number(url.searchParams.get("after") ?? "0") || 0);

  const roomRows = await db.select().from(rooms).where(eq(rooms.slug, roomSlug)).limit(1);
  const room = roomRows[0];
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  if (room.isVault) {
    const inside = await getVaultUser();
    if (!inside) {
      return NextResponse.json({ error: "The Vault is sealed." }, { status: 403 });
    }
  }

  const user = await getSessionUser();
  const [rows, reactions, online] = await Promise.all([
    getRoomMessages(room.id, room.isVault, after),
    getRoomReactions(room.id, user?.id ?? null),
    getRoomOnlineCount(room.id),
    purgeExpiredMessages().catch(() => undefined),
  ]);

  const purgedIds: number[] = [];
  for (const row of rows) {
    if (detectAbuse(row.message.content)) purgedIds.push(row.message.id);
  }
  if (purgedIds.length > 0) {
    await db.delete(messages).where(inArray(messages.id, purgedIds));
  }

  const hidden = user ? await getHiddenUserIds(user.id) : new Set<number>();
  const live = rows.filter(
    (row) => !purgedIds.includes(row.message.id) && !hidden.has(row.author.id),
  );

  if (user) touchPresence(user.id);

  return NextResponse.json({
    messages: live.map((row) => serializeMessage(row.message, row.author)),
    purgedIds,
    reactions,
    online: { room: online },
    me: user
      ? {
          strikes: user.strikes,
          mutedUntil: user.mutedUntil,
          banned: user.banned,
          dev: user.isDev,
        }
      : null,
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to join the conversation." }, { status: 401 });
  }

  const gate = gateVerdict(user);
  if (gate) {
    return NextResponse.json(
      { error: gate.error, code: gate.code, mutedUntil: gate.mutedUntil },
      { status: 403 },
    );
  }

  const ip = clientIp(req);
  const rl = checkRateLimit(`messages:${ip}:${user.id}`, 8, 10_000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "messages");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const roomSlug = String(body.room ?? "").trim();
  const content = String(body.content ?? "").trim();
  if (!content || content.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Messages must be 1-${MAX_MESSAGE_LENGTH} characters.` },
      { status: 400 },
    );
  }
  if (containsInjection(content)) {
    return NextResponse.json(
      { error: "Messages cannot contain code or script tags." },
      { status: 400 },
    );
  }

  const verdict = await enforceAbuseRule(user, content);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: verdict.error, code: verdict.code, mutedUntil: verdict.mutedUntil },
      { status: 403 },
    );
  }

  const roomRows = await db.select().from(rooms).where(eq(rooms.slug, roomSlug)).limit(1);
  const room = roomRows[0];
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  if (room.isVault) {
    const inside = await getVaultUser();
    if (!inside) {
      return NextResponse.json({ error: "The Vault is sealed." }, { status: 403 });
    }
  }

  const lastMessage = await db
    .select({ createdAt: messages.createdAt, content: messages.content })
    .from(messages)
    .where(and(eq(messages.userId, user.id), eq(messages.roomId, room.id)))
    .orderBy(sql`${messages.id} desc`)
    .limit(1);

  if (
    lastMessage[0] &&
    Date.now() - lastMessage[0].createdAt.getTime() < MESSAGE_COOLDOWN_MS
  ) {
    return NextResponse.json(
      { error: "Messages can be sent once every 1.5 seconds." },
      { status: 429 },
    );
  }
  if (lastMessage[0]?.content === content) {
    return NextResponse.json(
      { error: "You just sent that message." },
      { status: 429 },
    );
  }

  const [created] = await db
    .insert(messages)
    .values({ roomId: room.id, userId: user.id, content })
    .returning();

  void purgeExpiredMessages().catch(() => undefined);

  const [updated] = await db
    .update(users)
    .set({ xp: sql`${users.xp} + ${XP_AWARDS.MESSAGE}`, lastSeenAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();

  return NextResponse.json({
    message: serializeMessage(created, updated),
    xpGained: XP_AWARDS.MESSAGE,
  });
}
