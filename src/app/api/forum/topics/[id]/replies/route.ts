import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { replies, topics, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { containsInjection } from "@/lib/antibot";
import { enforceAbuseRule, gateVerdict } from "@/lib/moderation";
import { MAX_REPLY_CONTENT, XP_AWARDS } from "@/lib/ranks";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { serializeReply } from "@/lib/utils";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log in to reply." },
      { status: 401 },
    );
  }

  const rl = checkRateLimit(`replies:${user.id}`, 10, 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "replies");

  const { id } = await params;
  const topicId = Number(id);
  if (!Number.isInteger(topicId)) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const content = String(body.content ?? "").trim();
  if (!content || content.length > MAX_REPLY_CONTENT) {
    return NextResponse.json(
      { error: `Reply must be 1-${MAX_REPLY_CONTENT} characters.` },
      { status: 400 },
    );
  }
  if (containsInjection(content)) {
    return NextResponse.json(
      { error: "Replies can't contain code or script tags. 🛡️" },
      { status: 400 },
    );
  }

  const gate = gateVerdict(user);
  if (gate) {
    return NextResponse.json(
      { error: gate.error, code: gate.code },
      { status: 403 },
    );
  }
  const verdict = await enforceAbuseRule(user, content);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: verdict.error, code: verdict.code },
      { status: 403 },
    );
  }

  const topicRows = await db
    .select({ id: topics.id })
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);
  if (!topicRows[0]) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  const [created] = await db
    .insert(replies)
    .values({ topicId, userId: user.id, content })
    .returning();

  await Promise.all([
    db
      .update(topics)
      .set({
        replyCount: sql`${topics.replyCount} + 1`,
        lastActivityAt: new Date(),
      })
      .where(eq(topics.id, topicId)),
    db
      .update(users)
      .set({
        xp: sql`${users.xp} + ${XP_AWARDS.REPLY}`,
        lastSeenAt: new Date(),
      })
      .where(eq(users.id, user.id)),
  ]);

  return NextResponse.json({
    reply: serializeReply(created, user),
    xpGained: XP_AWARDS.REPLY,
  });
}
