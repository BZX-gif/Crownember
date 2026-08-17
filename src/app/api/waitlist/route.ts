import { ilike } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { waitlist } from "@/db/schema";
import { botTrap } from "@/lib/antibot";
import {
  checkRateLimit,
  clientIp,
  tooManyRequests,
} from "@/lib/rate-limit";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = checkRateLimit(`waitlist:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "waitlist joins");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (botTrap(body)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const nickname = String(body.nickname ?? "").trim();
  const note = String(body.note ?? "").trim().slice(0, 200);

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(nickname)) {
    return NextResponse.json(
      { error: "Nickname must be 3-20 characters (letters, numbers, underscore)." },
      { status: 400 },
    );
  }

  const existing = await db
    .select({ id: waitlist.id })
    .from(waitlist)
    .where(ilike(waitlist.nickname, nickname))
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "That nickname is already on the waitlist. You're in line! 🎟️" },
      { status: 409 },
    );
  }

  const [entry] = await db
    .insert(waitlist)
    .values({ nickname, note })
    .returning();

  return NextResponse.json({
    position: entry.id,
    nickname: entry.nickname,
  });
}
