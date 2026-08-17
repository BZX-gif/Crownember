import { and, eq, gt, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { directMessages } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { containsInjection } from "@/lib/antibot";
import {
  enforceAbuseRule,
  gateVerdict,
} from "@/lib/moderation";
import { purgeExpiredMessages } from "@/lib/purge";
import {
  checkRateLimit,
  tooManyRequests,
} from "@/lib/rate-limit";
import { messageCutoff } from "@/lib/retention";
import {
  findUserByUsername,
  getBlockState,
} from "@/lib/social";

const MAX_DM_LENGTH = 400;

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Log in first." }, { status: 401 });
  }
  const url = new URL(req.url);
  const withName = url.searchParams.get("with") ?? "";
  const after = Math.max(0, Number(url.searchParams.get("after") ?? "0") || 0);

  const other = await findUserByUsername(withName);
  if (!other) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  await purgeExpiredMessages();

  const block = await getBlockState(user.id, other.id);
  if (block.any) {
    // Sealed channels reveal nothing — not even their existence.
    return NextResponse.json({ sealed: true, messages: [] });
  }

  const rows = await db
    .select()
    .from(directMessages)
    .where(
      and(
        or(
          and(
            eq(directMessages.senderId, user.id),
            eq(directMessages.recipientId, other.id),
          ),
          and(
            eq(directMessages.senderId, other.id),
            eq(directMessages.recipientId, user.id),
          ),
        ),
        gt(directMessages.id, after),
      ),
    )
    .orderBy(directMessages.id)
    .limit(80);

  const live = rows.filter(
    (m) => m.createdAt.getTime() > messageCutoff().getTime(),
  );

  return NextResponse.json({
    sealed: false,
    messages: live.map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      mine: m.senderId === user.id,
    })),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Log in first." }, { status: 401 });
  }

  // The Judgement System governs DMs too — muted or exiled players are silent.
  const gate = gateVerdict(user);
  if (gate) {
    return NextResponse.json(
      { error: gate.error, code: gate.code, mutedUntil: gate.mutedUntil },
      { status: 403 },
    );
  }

  const rl = checkRateLimit(`dm:${user.id}`, 8, 10_000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "messages");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const content = String(body.content ?? "").trim();
  const other = await findUserByUsername(String(body.username ?? ""));
  if (!other) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }
  if (other.id === user.id) {
    return NextResponse.json(
      { error: "Notes to self go in the forum. 😄" },
      { status: 400 },
    );
  }
  if (!content || content.length > MAX_DM_LENGTH) {
    return NextResponse.json(
      { error: `Message must be 1-${MAX_DM_LENGTH} characters.` },
      { status: 400 },
    );
  }
  if (containsInjection(content)) {
    return NextResponse.json(
      { error: "Messages can't contain code or script tags. 🛡️" },
      { status: 400 },
    );
  }

  const block = await getBlockState(user.id, other.id);
  if (block.any) {
    return NextResponse.json(
      { error: "This channel is sealed. 🔒" },
      { status: 403 },
    );
  }

  const verdict = await enforceAbuseRule(user, content);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: verdict.error, code: verdict.code, mutedUntil: verdict.mutedUntil },
      { status: 403 },
    );
  }

  const [created] = await db
    .insert(directMessages)
    .values({ senderId: user.id, recipientId: other.id, content })
    .returning();

  return NextResponse.json({
    message: {
      id: created.id,
      content: created.content,
      createdAt: created.createdAt,
      mine: true,
    },
  });
}
