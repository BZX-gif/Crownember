import { asc, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages, rooms, users } from "@/db/schema";
import { purgeExpiredMessages } from "@/lib/purge";
import { getVaultUser } from "@/lib/vault";

export async function GET() {
  const [, allRooms, globalOnline, roomActivity, vaultUser] = await Promise.all([
    purgeExpiredMessages().catch(() => undefined),
    db.select().from(rooms).orderBy(asc(rooms.id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(gte(users.lastSeenAt, new Date(Date.now() - 60_000))),
    // (purge runs in parallel above)
    db
      .select({
        roomId: messages.roomId,
        n: sql<number>`count(distinct ${messages.userId})::int`,
      })
      .from(messages)
      .where(gte(messages.createdAt, new Date(Date.now() - 3 * 60_000)))
      .groupBy(messages.roomId),
    getVaultUser(),
  ]);

  const onlineByRoom = new Map(
    roomActivity.map((r) => [r.roomId, Number(r.n)]),
  );

  return NextResponse.json({
    online: { global: Number(globalOnline[0]?.n ?? 0) },
    rooms: allRooms.map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      icon: r.icon,
      color: r.color,
      online: onlineByRoom.get(r.id) ?? 0,
      // Explicitly expose the classification so notification clients can
      // permanently exclude the Vault even while the Vault is unlocked.
      isVault: r.isVault,
      locked: r.isVault && !vaultUser,
    })),
  });
}
