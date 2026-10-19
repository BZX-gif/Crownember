import { and, desc, eq, gt, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  directMessages,
  friendships,
  replies,
  settings,
  topicLikes,
  topics,
  users,
} from "@/db/schema";
import { getHiddenUserIds } from "@/lib/social";

export type NotificationType = "reply" | "like" | "friend" | "message";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  unread: boolean;
  actor: { username: string };
}

export interface NotificationFeed {
  items: AppNotification[];
  unreadCount: number;
  readAt: string | null;
}

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const LIMIT = 30;
const CURSOR_KEY = "notifications_read_at:";

/**
 * Notifications are derived from records the product already keeps, so there
 * is no new table to migrate and no possibility of an unread badge that does
 * not correspond to a real event. The read cursor lives in `settings`, a
 * key/value table that already exists in production.
 */
export async function getNotifications(userId: number): Promise<NotificationFeed> {
  const [cursorRow] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, `${CURSOR_KEY}${userId}`))
    .limit(1);
  const readAt = cursorRow?.value ?? null;
  const readTime = readAt ? new Date(readAt) : null;
  const since = new Date(Date.now() - WINDOW_MS);
  const hidden = await getHiddenUserIds(userId);

  const [replyRows, likeRows, friendRows, dmRows] = await Promise.all([
    db
      .select({
        id: replies.id,
        topicId: replies.topicId,
        title: topics.title,
        content: replies.content,
        createdAt: replies.createdAt,
        author: users.username,
        replyOwner: topics.userId,
      })
      .from(replies)
      .innerJoin(topics, eq(replies.topicId, topics.id))
      .innerJoin(users, eq(replies.userId, users.id))
      .where(
        and(
          eq(topics.userId, userId),
          ne(replies.userId, userId),
          eq(users.isBot, false),
          gt(replies.createdAt, since),
        ),
      )
      .orderBy(desc(replies.id))
      .limit(15),

    db
      .select({
        topicId: topicLikes.topicId,
        title: topics.title,
        createdAt: topicLikes.createdAt,
        author: users.username,
        likerId: topicLikes.userId,
      })
      .from(topicLikes)
      .innerJoin(topics, eq(topicLikes.topicId, topics.id))
      .innerJoin(users, eq(topicLikes.userId, users.id))
      .where(
        and(
          eq(topics.userId, userId),
          ne(topicLikes.userId, userId),
          eq(users.isBot, false),
          gt(topicLikes.createdAt, since),
        ),
      )
      .orderBy(desc(topicLikes.id))
      .limit(15),

    db
      .select({
        id: friendships.id,
        createdAt: friendships.createdAt,
        author: users.username,
        requesterId: friendships.requesterId,
      })
      .from(friendships)
      .innerJoin(users, eq(friendships.requesterId, users.id))
      .where(
        and(
          eq(friendships.addresseeId, userId),
          eq(friendships.status, "pending"),
          eq(users.isBot, false),
          gt(friendships.createdAt, since),
        ),
      )
      .orderBy(desc(friendships.id))
      .limit(15),

    db
      .select({
        id: directMessages.id,
        content: directMessages.content,
        createdAt: directMessages.createdAt,
        author: users.username,
        senderId: directMessages.senderId,
      })
      .from(directMessages)
      .innerJoin(users, eq(directMessages.senderId, users.id))
      .where(
        and(
          eq(directMessages.recipientId, userId),
          eq(users.isBot, false),
          gt(directMessages.createdAt, since),
        ),
      )
      .orderBy(desc(directMessages.id))
      .limit(60),
  ]);

  const items: AppNotification[] = [];
  const seenDmSenders = new Set<number>();

  for (const row of replyRows) {
    if (hidden.has(row.replyOwner)) continue;
    items.push({
      id: `reply:${row.id}`,
      type: "reply",
      title: `${row.author} replied to your post`,
      body: row.content.slice(0, 140),
      href: `/forum/${row.topicId}#replies`,
      createdAt: row.createdAt.toISOString(),
      unread: !readTime || row.createdAt > readTime,
      actor: { username: row.author },
    });
  }

  for (const row of likeRows) {
    if (hidden.has(row.likerId)) continue;
    items.push({
      id: `like:${row.topicId}:${row.author}`,
      type: "like",
      title: `${row.author} appreciated your post`,
      body: row.title,
      href: `/forum/${row.topicId}`,
      createdAt: row.createdAt.toISOString(),
      unread: !readTime || row.createdAt > readTime,
      actor: { username: row.author },
    });
  }

  for (const row of friendRows) {
    if (hidden.has(row.requesterId)) continue;
    items.push({
      id: `friend:${row.id}`,
      type: "friend",
      title: `${row.author} sent you a friend request`,
      body: "Open Messages to accept or decline.",
      href: "/messages",
      createdAt: row.createdAt.toISOString(),
      unread: !readTime || row.createdAt > readTime,
      actor: { username: row.author },
    });
  }

  for (const row of dmRows) {
    if (hidden.has(row.senderId)) continue;
    if (seenDmSenders.has(row.senderId)) continue;
    seenDmSenders.add(row.senderId);
    items.push({
      id: `message:${row.id}`,
      type: "message",
      title: `Message from ${row.author}`,
      body: row.content.slice(0, 140),
      href: `/messages/${encodeURIComponent(row.author)}`,
      createdAt: row.createdAt.toISOString(),
      unread: !readTime || row.createdAt > readTime,
      actor: { username: row.author },
    });
  }

  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const limited = items.slice(0, LIMIT);

  return {
    items: limited,
    unreadCount: limited.filter((item) => item.unread).length,
    readAt,
  };
}

export async function markAllNotificationsRead(userId: number) {
  const now = new Date().toISOString();
  await db
    .insert(settings)
    .values({ key: `${CURSOR_KEY}${userId}`, value: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: now },
    });
  return now;
}
