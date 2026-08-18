import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

const MAX_BYTES = 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const value = form.get("avatar");
  if (!(value instanceof File)) return NextResponse.json({ error: "Image required" }, { status: 400 });
  if (!TYPES.has(value.type)) return NextResponse.json({ error: "Use JPG, PNG or WebP" }, { status: 400 });
  if (value.size > MAX_BYTES) return NextResponse.json({ error: "Image must be under 1 MB" }, { status: 400 });

  const bytes = new Uint8Array(await value.arrayBuffer());
  await db.update(users).set({ avatarData: Buffer.from(bytes), avatarMime: value.type, avatarVersion: new Date() }).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await db.update(users).set({ avatarData: null, avatarMime: null, avatarVersion: new Date() }).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true });
}
