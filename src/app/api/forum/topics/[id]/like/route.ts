import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { topicLikes, topics, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { XP_AWARDS } from "@/lib/ranks";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log in to like topics." },
      { status: 401 },
    );
  }

  const rl = checkRateLimit(`likes:${user.id}`, 30, 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "likes");

  const { id } = await params;
  const topicId = Number(id);
  if (!Number.isInteger(topicId)) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  const topicRows = await db
    .select()
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);
  const topic = topicRows[0];
  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  const existing = await db
    .select({ id: topicLikes.id })
    .from(topicLikes)
    .where(
      and(eq(topicLikes.topicId, topicId), eq(topicLikes.userId, user.id)),
    )
    .limit(1);

  if (existing[0]) {
    // Unlike
    await Promise.all([
      db.delete(topicLikes).where(eq(topicLikes.id, existing[0].id)),
      db
        .update(topics)
        .set({ likes: sql`greatest(${topics.likes} - 1, 0)` })
        .where(eq(topics.id, topicId)),
    ]);
    return NextResponse.json({
      liked: false,
      likes: Math.max(0, topic.likes - 1),
    });
  }

  // Like
  await db.insert(topicLikes).values({ topicId, userId: user.id });
  await db
    .update(topics)
    .set({ likes: sql`${topics.likes} + 1` })
    .where(eq(topics.id, topicId));

  // Reward the author (no self-farming)
  if (topic.userId !== user.id) {
    await db
      .update(users)
      .set({
        xp: sql`${users.xp} + ${XP_AWARDS.LIKE_RECEIVED}`,
        likes: sql`${users.likes} + 1`,
      })
      .where(eq(users.id, topic.userId));
  }

  return NextResponse.json({ liked: true, likes: topic.likes + 1 });
}
