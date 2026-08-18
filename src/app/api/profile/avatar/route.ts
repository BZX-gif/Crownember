import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSessionUser } from "@/lib/auth";

const MAX_BYTES = 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(request: Request) {
  const username = new URL(request.url).searchParams.get("username");
  if (!username) return new NextResponse(null, { status: 400 });
  const rows = await db.execute(sql`select avatar_data as "avatarData", avatar_mime as "avatarMime" from users where username = ${username} limit 1`);
  const avatar = rows.rows[0] as { avatarData?: Buffer; avatarMime?: string } | undefined;
  if (!avatar?.avatarData || !avatar.avatarMime) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(avatar.avatarData), { headers: { "Content-Type": avatar.avatarMime, "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData();
  const value = form.get("avatar");
  if (!(value instanceof File)) return NextResponse.json({ error: "Image required" }, { status: 400 });
  if (!TYPES.has(value.type)) return NextResponse.json({ error: "Use JPG, PNG or WebP" }, { status: 400 });
  if (value.size > MAX_BYTES) return NextResponse.json({ error: "Image must be under 1 MB" }, { status: 400 });
  const bytes = Buffer.from(await value.arrayBuffer());
  await db.execute(sql`update users set avatar_data = ${bytes}, avatar_mime = ${value.type}, avatar_version = now() where id = ${user.id}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await db.execute(sql`update users set avatar_data = null, avatar_mime = null, avatar_version = now() where id = ${user.id}`);
  return NextResponse.json({ ok: true });
}
