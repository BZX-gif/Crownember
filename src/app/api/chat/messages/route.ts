import { and, desc, eq, gt, gte, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages, rooms, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { containsInjection } from "@/lib/antibot";
import {
  detectAbuse,
  enforceAbuseRule,
  gateVerdict,
} from "@/lib/moderation";
import { purgeExpiredMessages } from "@/lib/purge";
import { messageCutoff } from "@/lib/retention";
import { getVaultUser } from "@/lib/vault";
import {
  MAX_MESSAGE_LENGTH,
  MESSAGE_COOLDOWN_MS,
  XP_AWARDS,
} from "@/lib/ranks";
import {
  checkRateLimit,
  clientIp,
  tooManyRequests,
} from "@/lib/rate-limit";
import { serializeMessage } from "@/lib/utils";

async function getOnlineCounts(roomId: number) {
  const [globalOnline, roomOnline] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(gte(users.lastSeenAt, new Date(Date.now() - 60_000))),
    db
      .select({ n: sql<number>`count(distinct ${messages.userId})::int` })
      .from(messages)
      .where(
        and(
          eq(messages.roomId, roomId),
          gte(messages.createdAt, new Date(Date.now() - 3 * 60_000)),
        ),
      ),
  ]);
  return {
    global: Number(globalOnline[0]?.n ?? 0),
    room: Number(roomOnline[0]?.n ?? 0),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const roomSlug = url.searchParams.get("room") ?? "";
  const after = Math.max(0, Number(url.searchParams.get("after") ?? "0") || 0);

  const roomRows = await db
    .select()
    .from(rooms)
    .where(eq(rooms.slug, roomSlug))
    .limit(1);
  const room = roomRows[0];
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  // The Vault reads require a live vault token (flag-based: the vault can
  // be renamed without weakening the gate)
  if (room.isVault) {
    const inside = await getVaultUser();
    if (!inside) {
      return NextResponse.json(
        { error: "The Vault is sealed. 🔐" },
        { status: 403 },
      );
    }
  }

  const user = await getSessionUser();
  const queries: Promise<unknown>[] = [
    // Lazy self-destruct: wipe anything older than 3h, then only serve
    // messages that are still alive.
    purgeExpiredMessages(),
    db
      .select({ message: messages, author: users })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .where(
        and(
          eq(messages.roomId, room.id),
          gt(messages.id, after),
          gte(messages.createdAt, messageCutoff(room.isVault)),
        ),
      )
      .orderBy(desc(messages.id))
      .limit(60),
    getOnlineCounts(room.id),
  ];
  if (user) {
    queries.push(
      db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id)),
    );
  }

  const [, messageRows, online] = await Promise.all(queries);
  const rows = (messageRows as { message: typeof messages.$inferSelect; author: typeof users.$inferSelect }[]).reverse();

  // Silent sweep: any abusive message that slipped in (or predates the
  // filter) burns on sight — deleted from the database and quietly pruned
  // from every connected client. No errors, no traces.
  const purgedIds: number[] = [];
  for (const r of rows) {
    if (detectAbuse(r.message.content)) purgedIds.push(r.message.id);
  }
  if (purgedIds.length > 0) {
    await db.delete(messages).where(inArray(messages.id, purgedIds));
  }
  const live = rows.filter((r) => !purgedIds.includes(r.message.id));

  return NextResponse.json({
    messages: live.map((r) => serializeMessage(r.message, r.author)),
    purgedIds,
    online,
    // lets the composer restore mute/ban state after a refresh
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
    return NextResponse.json(
      { error: "You must be logged in to chat." },
      { status: 401 },
    );
  }

  // The Judgement System: exiled or muted users don't get to speak.
  const gate = gateVerdict(user);
  if (gate) {
    return NextResponse.json(
      { error: gate.error, code: gate.code, mutedUntil: gate.mutedUntil },
      { status: 403 },
    );
  }

  // Burst protection on top of the per-message cooldown
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
      { error: `Message must be 1-${MAX_MESSAGE_LENGTH} characters.` },
      { status: 400 },
    );
  }
  if (containsInjection(content)) {
    return NextResponse.json(
      { error: "Messages can't contain code or script tags. 🛡️" },
      { status: 400 },
    );
  }

  // Abuse check — the offending message is never posted.
  const verdict = await enforceAbuseRule(user, content);
  if (!verdict.ok) {
    return NextResponse.json(
      {
        error: verdict.error,
        code: verdict.code,
        mutedUntil: verdict.mutedUntil,
      },
      { status: 403 },
    );
  }

  const roomRows = await db
    .select()
    .from(rooms)
    .where(eq(rooms.slug, roomSlug))
    .limit(1);
  const room = roomRows[0];
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  if (room.isVault) {
    const inside = await getVaultUser();
    if (!inside) {
      return NextResponse.json(
        { error: "The Vault is sealed. 🔐" },
        { status: 403 },
      );
    }
  }

  // Anti-spam cooldown
  const lastMessage = await db
    .select({ createdAt: messages.createdAt, content: messages.content })
    .from(messages)
    .where(and(eq(messages.userId, user.id), eq(messages.roomId, room.id)))
    .orderBy(desc(messages.id))
    .limit(1);
  if (
    lastMessage[0] &&
    Date.now() - lastMessage[0].createdAt.getTime() < MESSAGE_COOLDOWN_MS
  ) {
    return NextResponse.json(
      { error: "Chill out! You're chatting too fast (1.5s cooldown)." },
      { status: 429 },
    );
  }
  if (lastMessage[0]?.content === content) {
    return NextResponse.json(
      { error: "You just said that! Mix it up 🔁" },
      { status: 429 },
    );
  }

  const [created] = await db
    .insert(messages)
    .values({ roomId: room.id, userId: user.id, content })
    .returning();

  // Keep storage lean on write traffic too
  void purgeExpiredMessages();

  const [updated] = await db
    .update(users)
    .set({
      xp: sql`${users.xp} + ${XP_AWARDS.MESSAGE}`,
      lastSeenAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();

  return NextResponse.json({
    message: serializeMessage(created, updated),
    xpGained: XP_AWARDS.MESSAGE,
  });
}
