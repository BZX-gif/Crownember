import { ilike } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { FOUNDING_LIMIT, getSeatStats } from "@/lib/access";
import { botTrap } from "@/lib/antibot";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_DAYS,
} from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import {
  checkRateLimit,
  clientIp,
  tooManyRequests,
} from "@/lib/rate-limit";
import { serializeUser } from "@/lib/utils";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "sign-ups");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (botTrap(body)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  const uid = String(body.uid ?? "").trim().slice(0, 15);
  const bio = String(body.bio ?? "").trim().slice(0, 200);

  if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3-16 characters (letters, numbers, underscore)." },
      { status: 400 },
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }
  if (uid && !/^\d{6,15}$/.test(uid)) {
    return NextResponse.json(
      { error: "Free Fire UID should be a number (6-15 digits)." },
      { status: 400 },
    );
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(ilike(users.username, username))
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "That username is already taken. Pick another IGN!" },
      { status: 409 },
    );
  }

  // Founding Squad gate: only 10 real players allowed at launch.
  const stats = await getSeatStats();
  if (!stats.open) {
    return NextResponse.json(
      {
        error: `The Founding Squad is FULL (${stats.taken}/${stats.max} seats taken). Join the waitlist!`,
        seats: stats,
      },
      { status: 403 },
    );
  }

  const isFounder = stats.taken < FOUNDING_LIMIT;
  const [created] = await db
    .insert(users)
    .values({
      username,
      passwordHash: hashPassword(password),
      uid,
      bio,
      founder: isFounder,
    })
    .returning();

  const token = await createSession(created.id);
  const res = NextResponse.json({ user: serializeUser(created) });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
