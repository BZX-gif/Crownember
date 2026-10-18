import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blocks, notifications } from "@/db/schema";

/**
 * The VYRON inbox — durable, in-app notifications for meaningful events:
 *   reply          someone replied to your topic
 *   like           someone liked your topic
 *   friend_request someone asked to connect
 *   friend_accept  your request was accepted
 *
 * Design rules (all server-side):
 * - Never self-notify.
 * - A block in EITHER direction silences notifications both ways — the same
 *   "block veil" the rest of the product uses.
 * - Like notifications are deduplicated by a partial UNIQUE index
 *   (user_id, actor_id, topic_id WHERE type = 'like'): a retried request can
 *   never double-notify, and a re-like refreshes the existing entry instead
 *   of stacking a new one.
 * - History is bounded: read items older than 30 days are pruned, and no
 *   account ever keeps more than the newest 200 notifications — the free
 *   database stays lean forever.
 */

export const NOTIFICATION_TYPES = [
  "reply",
  "like",
  "friend_request",
  "friend_accept",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const MAX_BODY = 140;
const KEEP_LATEST = 200;
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;

// Lazy, throttled pruning — piggybacks on reads exactly like the chat TTL
// purge piggybacks on chat traffic. No cron, no workers.
const lastPrune = new Map<number, number>();

export interface NotificationInput {
  /** recipient */
  userId: number;
  /** who triggered it */
  actorId: number;
  type: NotificationType;
  topicId?: number | null;
  /** short preview — a reply excerpt or the topic title */
  body?: string;
}

export async function createNotification(
  input: NotificationInput,
): Promise<void> {
  try {
    await createNotificationInner(input);
  } catch {
    // The inbox is a side-effect, never a single point of failure: a reply,
    // like or friend request must succeed even if its notification cannot be
    // written. The next poll simply shows nothing new.
  }
}

async function createNotificationInner(
  input: NotificationInput,
): Promise<void> {
  if (!NOTIFICATION_TYPES.includes(input.type)) return;
  if (input.userId === input.actorId) return;
  if (input.type !== "friend_request" && input.type !== "friend_accept" && !input.topicId) {
    return;
  }

  const body = (input.body ?? "").slice(0, MAX_BODY);

  // The block veil: sealed members never trigger each other's inbox.
  const veil = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      or(
        and(
          eq(blocks.blockerId, input.userId),
          eq(blocks.blockedId, input.actorId),
        ),
        and(
          eq(blocks.blockerId, input.actorId),
          eq(blocks.blockedId, input.userId),
        ),
      ),
    )
    .limit(1);
  if (veil[0]) return;

  if (input.type === "like") {
    // One like-notification per (recipient, actor, topic). Re-liking after an
    // unlike refreshes the same row back to unread+now; the partial unique
    // index makes the insert race-safe (retries/conflicts are swallowed).
    const bumped = await db
      .update(notifications)
      .set({ createdAt: new Date(), readAt: null, body })
      .where(
        and(
          eq(notifications.userId, input.userId),
          eq(notifications.actorId, input.actorId),
          eq(notifications.type, "like"),
          eq(notifications.topicId, input.topicId ?? -1),
        ),
      )
      .returning({ id: notifications.id });
    if (bumped.length > 0) return;
    await db
      .insert(notifications)
      .values({
        userId: input.userId,
        actorId: input.actorId,
        type: input.type,
        topicId: input.topicId ?? null,
        body,
      })
      .onConflictDoNothing();
    return;
  }

  await db.insert(notifications).values({
    userId: input.userId,
    actorId: input.actorId,
    type: input.type,
    topicId: input.topicId ?? null,
    body,
  });
}

export interface NotificationRow {
  id: number;
  type: string;
  body: string;
  topicId: number | null;
  readAt: Date | null;
  createdAt: Date;
  actorId: number;
}

export async function listNotifications(
  userId: number,
  limit = 30,
): Promise<NotificationRow[]> {
  await maybePrune(userId);
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      body: notifications.body,
      topicId: notifications.topicId,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actorId: notifications.actorId,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.id))
    .limit(limit);
  return rows;
}

export async function countUnread(userId: number): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(rows[0]?.n ?? 0);
}

/** Marks everything read; returns the (now zero) unread count source of truth. */
export async function markAllRead(userId: number): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

async function maybePrune(userId: number): Promise<void> {
  const now = Date.now();
  if (now - (lastPrune.get(userId) ?? 0) < PRUNE_INTERVAL_MS) return;
  lastPrune.set(userId, now);
  if (lastPrune.size > 10_000) lastPrune.clear();
  try {
    await db.execute(sql`
      delete from notifications
      where user_id = ${userId}
        and read_at < now() - interval '30 days'
    `);
    await db.execute(sql`
      delete from notifications
      where user_id = ${userId}
        and id not in (
          select id from notifications
          where user_id = ${userId}
          order by id desc
          limit ${KEEP_LATEST}
        )
    `);
  } catch {
    // pruning is housekeeping — never let it break the inbox read
  }
}
