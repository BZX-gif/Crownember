import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { avatarVersion, serializeUser } from "@/lib/utils";

const MAX_BYTES = 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Public profile picture. The response carries a strong ETag derived from
 * `avatar_version`, so a browser can revalidate cheaply and an upload is
 * visible immediately (the URL cache-buster changes too).
 */
export async function GET(request: Request) {
  const username = new URL(request.url).searchParams.get("username");
  if (!username) return new NextResponse(null, { status: 400 });

  let rows;
  try {
    rows = await db.execute(
      sql`select avatar_data as "avatarData", avatar_mime as "avatarMime",
                 avatar_version as "avatarVersion"
          from users where username = ${username} limit 1`,
    );
  } catch {
    // A deployment that has not run the migration yet must degrade to the
    // initials fallback rather than a 500 for every avatar on the site.
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "public, max-age=300" },
    });
  }

  const avatar = rows.rows[0] as
    | { avatarData?: Buffer; avatarMime?: string; avatarVersion?: Date }
    | undefined;
  if (!avatar?.avatarData || !avatar.avatarMime) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "public, max-age=300" },
    });
  }

  const version = avatarVersion(avatar.avatarVersion as Date | undefined);
  const etag = `"${version}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return new NextResponse(new Uint8Array(avatar.avatarData), {
    headers: {
      "Content-Type": avatar.avatarMime,
      "Cache-Control": "public, max-age=300, must-revalidate",
      ETag: etag,
    },
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const value = form.get("avatar");
  if (!(value instanceof File)) {
    return NextResponse.json({ error: "Choose an image first." }, { status: 400 });
  }
  if (!TYPES.has(value.type)) {
    return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 400 });
  }
  if (value.size > MAX_BYTES) {
    return NextResponse.json({ error: "Images must be under 1 MB." }, { status: 400 });
  }

  const bytes = Buffer.from(await value.arrayBuffer());
  try {
    await db.execute(
      sql`update users set avatar_data = ${bytes}, avatar_mime = ${value.type},
                 avatar_version = now() where id = ${user.id}`,
    );
  } catch {
    return NextResponse.json(
      { error: "Profile pictures are unavailable on this deployment." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, user: serializeUser(user) });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await db.execute(
      sql`update users set avatar_data = null, avatar_mime = null,
                 avatar_version = now() where id = ${user.id}`,
    );
  } catch {
    return NextResponse.json(
      { error: "Profile pictures are unavailable on this deployment." },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true });
}
