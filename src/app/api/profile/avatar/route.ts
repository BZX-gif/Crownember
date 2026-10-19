import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { MAX_IMAGE_BYTES, safeServeMime, validateImageFile } from "@/lib/images";
import { avatarVersion, serializeUser } from "@/lib/utils";

const MAX_BYTES = MAX_IMAGE_BYTES;

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

  // The served Content-Type comes from the bytes, never from what a client
  // once claimed. A row whose stored mime disagrees with its content (or whose
  // content is not an image at all) is not served: run
  // `npx tsx scripts/fix-avatar-mimes.ts` to reclassify legacy rows.
  const bytes = avatar.avatarData as Buffer;
  const mime = safeServeMime(bytes, avatar.avatarMime);
  if (!mime) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
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
  // Size and declared type are checked first (cheap), then the real format is
  // sniffed from the file signature. The SNIFFED mime is what gets stored.
  const image = await validateImageFile(value, { maxBytes: MAX_BYTES, label: "Image" });
  if (!image.ok) {
    return NextResponse.json({ error: image.error }, { status: 400 });
  }

  try {
    await db.execute(
      sql`update users set avatar_data = ${image.bytes}, avatar_mime = ${image.mime},
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
