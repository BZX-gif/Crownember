import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_DAYS,
  sessionCookieOptions,
} from "@/lib/auth";
import { verifyPassword, DUMMY_PASSWORD_HASH } from "@/lib/password";
import { eqLower } from "@/lib/lookup";
import {
  checkRateLimit,
  clientIp,
  tooManyRequests,
} from "@/lib/rate-limit";
import { serializeUser } from "@/lib/utils";

const MAX_PASSWORD_LENGTH = 256;

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
  if (password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: "Invalid username or password." },
      { status: 401 },
    );
  }

  // Per-username throttle on top of the per-IP one: a distributed
  // brute-force against a single account still hits this wall.
  const userRl = checkRateLimit(
    `login-user:${username.toLowerCase()}`,
    10,
    15 * 60 * 1000,
  );
  if (!userRl.allowed) {
    return tooManyRequests(userRl.retryInMs, "login attempts");
  }

  const rows = await db
    .select()
    .from(users)
    .where(eqLower(users.username, username))
    .limit(1);
  const user = rows[0];

  // Same error, same cost either way — unknown accounts still pay the
  // scrypt price so response timing can't confirm whether a name exists.
  const ok = user
    ? verifyPassword(password, user.passwordHash)
    : (verifyPassword(password, DUMMY_PASSWORD_HASH), false);

  if (!user || !ok || user.isBot) {
    return NextResponse.json(
      { error: "Invalid username or password." },
      { status: 401 },
    );
  }

  if (user.banned) {
    return NextResponse.json(
      {
        error:
          "☠️ This account has been permanently exiled from VYRON. The gates will not open for you.",
        code: "BANNED_PERM",
      },
      { status: 403 },
    );
  }

  const token = await createSession(user.id);
  const res = NextResponse.json({ user: serializeUser(user) });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
