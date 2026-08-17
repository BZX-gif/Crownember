import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blocks, directMessages, friendships, users } from "@/db/schema";

/**
 * The social layer — friends, blocks and their consequences.
 *
 * Block semantics ("I never see them, they never see me"):
 *  - messages in rooms, DM threads, forum topics/replies from either side
 *    are hidden from the other, everywhere
 *  - DMs and friend requests between the two are sealed
 *  - blocking instantly deletes any friendship and pending requests
 */

export type Relationship = "self" | "friends" | "outgoing" | "incoming" | "none";

export interface BlockState {
  iBlockedThem: boolean;
  theyBlockedMe: boolean;
  any: boolean;
}

export async function findUserByUsername(username: string) {
  const rows = await db
    .select()
    .from(users)
    .where(ilike(users.username, username))
    .limit(1);
  return rows[0] ?? null;
}

export async function getBlockState(
  viewerId: number,
  targetId: number,
): Promise<BlockState> {
  const rows = await db
    .select()
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, targetId)),
        and(eq(blocks.blockerId, targetId), eq(blocks.blockedId, viewerId)),
      ),
    );
  const iBlockedThem = rows.some((r) => r.blockerId === viewerId);
  const theyBlockedMe = rows.some((r) => r.blockerId === targetId);
  return { iBlockedThem, theyBlockedMe, any: iBlockedThem || theyBlockedMe };
}

/** Every user id whose content must vanish from the viewer's screens. */
export async function getHiddenUserIds(viewerId: number): Promise<Set<number>> {
  const rows = await db
    .select()
    .from(blocks)
    .where(
      or(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, viewerId)),
    );
  const hidden = new Set<number>();
  for (const r of rows) {
    hidden.add(r.blockerId === viewerId ? r.blockedId : r.blockerId);
  }
  return hidden;
}

export async function getRelationship(
  viewerId: number,
  targetId: number,
): Promise<Relationship> {
  if (viewerId === targetId) return "self";
  const rows = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(
          eq(friendships.requesterId, viewerId),
          eq(friendships.addresseeId, targetId),
        ),
        and(
          eq(friendships.requesterId, targetId),
          eq(friendships.addresseeId, viewerId),
        ),
      ),
    )
    .limit(1);
  const f = rows[0];
  if (!f) return "none";
  if (f.status === "accepted") return "friends";
  return f.requesterId === viewerId ? "outgoing" : "incoming";
}

export async function sendFriendRequest(
  viewerId: number,
  targetId: number,
): Promise<{ ok: boolean; error?: string; autoAccepted?: boolean }> {
  if (viewerId === targetId) {
    return { ok: false, error: "You can't friend yourself — that's just self-love. 💛" };
  }
  const block = await getBlockState(viewerId, targetId);
  if (block.any) {
    return { ok: false, error: "This channel is sealed. 🔒" };
  }
  const rel = await getRelationship(viewerId, targetId);
  if (rel === "friends") return { ok: false, error: "You two are already squad. 🤝" };
  if (rel === "outgoing") return { ok: false, error: "Request already sent — patience, soldier." };
  if (rel === "incoming") {
    // They already asked — this becomes an instant accept.
    await db
      .update(friendships)
      .set({ status: "accepted" })
      .where(
        and(
          eq(friendships.requesterId, targetId),
          eq(friendships.addresseeId, viewerId),
        ),
      );
    return { ok: true, autoAccepted: true };
  }
  await db
    .insert(friendships)
    .values({ requesterId: viewerId, addresseeId: targetId, status: "pending" });
  return { ok: true };
}

export async function respondFriendRequest(
  viewerId: number,
  targetId: number,
  accept: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const rows = await db
    .select()
    .from(friendships)
    .where(
      and(
        eq(friendships.requesterId, targetId),
        eq(friendships.addresseeId, viewerId),
        eq(friendships.status, "pending"),
      ),
    )
    .limit(1);
  const f = rows[0];
  if (!f) return { ok: false, error: "No pending request from that player." };
  if (accept) {
    await db
      .update(friendships)
      .set({ status: "accepted" })
      .where(eq(friendships.id, f.id));
  } else {
    await db.delete(friendships).where(eq(friendships.id, f.id));
  }
  return { ok: true };
}

export async function removeFriend(
  viewerId: number,
  targetId: number,
): Promise<{ ok: boolean }> {
  await db
    .delete(friendships)
    .where(
      or(
        and(
          eq(friendships.requesterId, viewerId),
          eq(friendships.addresseeId, targetId),
        ),
        and(
          eq(friendships.requesterId, targetId),
          eq(friendships.addresseeId, viewerId),
        ),
      ),
    );
  return { ok: true };
}

/** Block = seal everything. Unblock = the seal lifts (friendship stays gone). */
export async function toggleBlock(
  viewerId: number,
  targetId: number,
): Promise<{ ok: boolean; nowBlocked: boolean; error?: string }> {
  if (viewerId === targetId) {
    return { ok: false, nowBlocked: false, error: "You can't block yourself." };
  }
  const existing = await db
    .select()
    .from(blocks)
    .where(
      and(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, targetId)),
    )
    .limit(1);

  if (existing[0]) {
    await db.delete(blocks).where(eq(blocks.id, existing[0].id));
    return { ok: true, nowBlocked: false };
  }

  await db.insert(blocks).values({ blockerId: viewerId, blockedId: targetId });
  // Burn every tie between the two: friendship + pending requests, both ways.
  await db
    .delete(friendships)
    .where(
      or(
        and(
          eq(friendships.requesterId, viewerId),
          eq(friendships.addresseeId, targetId),
        ),
        and(
          eq(friendships.requesterId, targetId),
          eq(friendships.addresseeId, viewerId),
        ),
      ),
    );
  return { ok: true, nowBlocked: true };
}

export interface DmThreadSummary {
  otherId: number;
  lastContent: string;
  lastAt: Date;
  lastFromMe: boolean;
}

export async function getDmThreads(viewerId: number): Promise<DmThreadSummary[]> {
  const rows = await db.execute(sql`
    select distinct on (other_id)
      other_id,
      content as last_content,
      created_at as last_at,
      (sender_id = ${viewerId}) as last_from_me
    from (
      select
        case when sender_id = ${viewerId} then recipient_id else sender_id end as other_id,
        sender_id,
        content,
        created_at
      from direct_messages
      where sender_id = ${viewerId} or recipient_id = ${viewerId}
      order by other_id, created_at desc
    ) t
    order by other_id, created_at desc
  `);
  return (rows.rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    otherId: Number(r.other_id),
    lastContent: String(r.last_content),
    lastAt: r.last_at as Date,
    lastFromMe: Boolean(r.last_from_me),
  }));
}

export async function countPendingRequests(viewerId: number): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(friendships)
    .where(
      and(
        eq(friendships.addresseeId, viewerId),
        eq(friendships.status, "pending"),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

export async function countFriends(viewerId: number): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(friendships)
    .where(
      and(
        or(
          eq(friendships.requesterId, viewerId),
          eq(friendships.addresseeId, viewerId),
        ),
        eq(friendships.status, "accepted"),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

/** Deletes a user's direct messages — used when one side blocks. */
export async function sealDirectMessages(
  viewerId: number,
  targetId: number,
): Promise<void> {
  await db
    .delete(directMessages)
    .where(
      or(
        and(
          eq(directMessages.senderId, viewerId),
          eq(directMessages.recipientId, targetId),
        ),
        and(
          eq(directMessages.senderId, targetId),
          eq(directMessages.recipientId, viewerId),
        ),
      ),
    );
}
