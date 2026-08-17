import { ilike } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_DAYS,
} from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import {
  checkRateLimit,
  clientIp,
  tooManyRequests,
} from "@/lib/rate-limit";
import { serializeUser } from "@/lib/utils";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) {
    return tooManyRequests(rl.retryInMs, "login attempts");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (!username || !password) {
    return NextResponse.json(
      { error: "Enter your username and password." },
      { status: 400 },
    );
  }

  const rows = await db
    .select()
    .from(users)
    .where(ilike(users.username, username))
    .limit(1);
  const user = rows[0];
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json(
      { error: "Invalid username or password." },
      { status: 401 },
    );
  }

  if (user.banned) {
    return NextResponse.json(
      {
        error:
          "☠️ This account has been permanently exiled from EMBERCROWN. The gates will not open for you.",
        code: "BANNED_PERM",
      },
      { status: 403 },
    );
  }

  const token = await createSession(user.id);
  const res = NextResponse.json({ user: serializeUser(user) });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
