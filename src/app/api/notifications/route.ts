import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import {
  countUnread,
  listNotifications,
  type NotificationRow,
} from "@/lib/notifications";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getHiddenUserIds } from "@/lib/social";

export interface NotificationDTO {
  id: number;
  type: string;
  body: string;
  topicId: number | null;
  read: boolean;
  createdAt: Date;
  actor: { id: number; username: string; avatarColor: string };
  href: string;
}

/**
 * The member's own inbox — strictly scoped to the session user. There is no
 * way to read another account's notifications: the WHERE clause IS the
 * session id, never a client-supplied value.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Log in first." }, { status: 401 });
  }

  const rl = checkRateLimit(`notifications:${user.id}`, 60, 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "inbox checks");

  let rows: NotificationRow[] = [];
  let unread = 0;
  try {
    [rows, unread] = await Promise.all([
      listNotifications(user.id, 30),
      countUnread(user.id),
    ]);
  } catch {
    // The inbox must never 500 the chrome — degrade to empty and let the
    // next fetch retry (the badge silently stays put).
    return NextResponse.json({ notifications: [], unread: 0 });
  }

  // The block veil applies retroactively: if either side has sealed the
  // other since the notification arrived, it disappears.
  const hidden = await getHiddenUserIds(user.id);
  const visible = rows.filter((r) => !hidden.has(r.actorId));

  const actorIds = [...new Set(visible.map((r) => r.actorId))];
  const actors = actorIds.length
    ? await db
        .select({
          id: users.id,
          username: users.username,
          avatarColor: users.avatarColor,
        })
        .from(users)
        .where(inArray(users.id, actorIds))
    : [];
  const byId = new Map(actors.map((a) => [a.id, a]));

  const dtos: NotificationDTO[] = visible.flatMap((r) => {
    const actor = byId.get(r.actorId);
    if (!actor) return [];
    return [
      {
        id: r.id,
        type: r.type,
        body: r.body,
        topicId: r.topicId,
        read: r.readAt !== null,
        createdAt: r.createdAt,
        actor,
        href:
          (r.type === "reply" || r.type === "like") && r.topicId
            ? `/forum/${r.topicId}`
            : `/players/${encodeURIComponent(actor.username)}`,
      },
    ];
  });

  return NextResponse.json({ notifications: dtos, unread });
}
