import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { topicLikes, topics, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { XP_AWARDS } from "@/lib/ranks";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

type ToggleOutcome =
  | { kind: "missing" }
  | { kind: "toggled"; liked: boolean; authorId: number; title: string };

/**
 * Like toggle — reliability contract:
 * - Exactly one like per (topic, member): enforced by the UNIQUE index, and
 *   the toggle resolves like-vs-unlike INSIDE a transaction using
 *   INSERT … ON CONFLICT DO NOTHING as the discriminator, so two concurrent
 *   clicks can never double-count.
 * - The reported count is the actual row count, not an optimistic guess.
 * - XP/the received-likes counter move BOTH ways: an unlike subtracts what
 *   the like granted (floored at 0), closing the like→unlike→re-like
 *   XP-farming loop.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log in to like posts." },
      { status: 401 },
    );
  }

  const rl = checkRateLimit(`likes:${user.id}`, 30, 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "likes");

  const { id } = await params;
  const topicId = Number(id);
  if (!Number.isInteger(topicId)) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  const outcome: ToggleOutcome = await db.transaction(async (tx) => {
    const topicRows = await tx
      .select({
        id: topics.id,
        userId: topics.userId,
        title: topics.title,
      })
      .from(topics)
      .where(eq(topics.id, topicId))
      .limit(1)
      .for("update");
    const topic = topicRows[0];
    if (!topic) return { kind: "missing" };

    // Like attempt wins the race: exactly one concurrent insert survives.
    const inserted = await tx
      .insert(topicLikes)
      .values({ topicId, userId: user.id })
      .onConflictDoNothing()
      .returning({ id: topicLikes.id });

    if (inserted[0]) {
      await tx
        .update(topics)
        .set({ likes: sql`${topics.likes} + 1` })
        .where(eq(topics.id, topicId));
      // Reward the author (no self-farming)
      if (topic.userId !== user.id) {
        await tx
          .update(users)
          .set({
            xp: sql`${users.xp} + ${XP_AWARDS.LIKE_RECEIVED}`,
            likes: sql`${users.likes} + 1`,
          })
          .where(eq(users.id, topic.userId));
      }
      return { kind: "toggled", liked: true, authorId: topic.userId, title: topic.title };
    }

    // Already liked → unlike. Subtract exactly what the like granted.
    // (At most one row can match — the UNIQUE index guarantees it.)
    await tx
      .delete(topicLikes)
      .where(
        and(eq(topicLikes.topicId, topicId), eq(topicLikes.userId, user.id)),
      );
    await tx
      .update(topics)
      .set({ likes: sql`greatest(${topics.likes} - 1, 0)` })
      .where(eq(topics.id, topicId));
    if (topic.userId !== user.id) {
      await tx
        .update(users)
        .set({
          xp: sql`greatest(${users.xp} - ${XP_AWARDS.LIKE_RECEIVED}, 0)`,
          likes: sql`greatest(${users.likes} - 1, 0)`,
        })
        .where(eq(users.id, topic.userId));
    }
    return { kind: "toggled", liked: false, authorId: topic.userId, title: topic.title };
  });

  if (outcome.kind === "missing") {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  // Source of truth for the UI: never a client-side assumption.
  const countRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(topicLikes)
    .where(eq(topicLikes.topicId, topicId));
  const likes = Number(countRows[0]?.n ?? 0);

  if (outcome.liked && outcome.authorId !== user.id) {
    await createNotification({
      userId: outcome.authorId,
      actorId: user.id,
      type: "like",
      topicId,
      body: outcome.title.slice(0, 140),
    });
  }

  return NextResponse.json({ liked: outcome.liked, likes });
}
