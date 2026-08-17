import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { topics, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { containsInjection } from "@/lib/antibot";
import { enforceAbuseRule, gateVerdict } from "@/lib/moderation";
import {
  MAX_TOPIC_CONTENT,
  MAX_TOPIC_TITLE,
  XP_AWARDS,
} from "@/lib/ranks";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { CATEGORIES, serializeTopic } from "@/lib/utils";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log in to start a topic." },
      { status: 401 },
    );
  }

  const rl = checkRateLimit(`topics:${user.id}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "topics");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();
  const category = String(body.category ?? "general").trim();

  if (containsInjection(title) || containsInjection(content)) {
    return NextResponse.json(
      { error: "Topics can't contain code or script tags. 🛡️" },
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
  const verdict = await enforceAbuseRule(user, `${title} ${content}`);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: verdict.error, code: verdict.code },
      { status: 403 },
    );
  }

  if (title.length < 3 || title.length > MAX_TOPIC_TITLE) {
    return NextResponse.json(
      { error: `Title must be 3-${MAX_TOPIC_TITLE} characters.` },
      { status: 400 },
    );
  }
  if (!content || content.length > MAX_TOPIC_CONTENT) {
    return NextResponse.json(
      { error: `Body must be 1-${MAX_TOPIC_CONTENT} characters.` },
      { status: 400 },
    );
  }
  const safeCategory = CATEGORIES.some((c) => c.slug === category)
    ? category
    : "general";

  const [created] = await db
    .insert(topics)
    .values({ title, content, category: safeCategory, userId: user.id })
    .returning();

  const [updated] = await db
    .update(users)
    .set({
      xp: sql`${users.xp} + ${XP_AWARDS.TOPIC}`,
      lastSeenAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();

  return NextResponse.json({
    topic: serializeTopic(created, updated),
    xpGained: XP_AWARDS.TOPIC,
  });
}
