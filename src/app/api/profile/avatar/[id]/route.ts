import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId < 1) return new NextResponse(null, { status: 400 });

  const rows = await db.select({ avatarData: users.avatarData, avatarMime: users.avatarMime }).from(users).where(eq(users.id, userId)).limit(1);
  const avatar = rows[0];
  if (!avatar?.avatarData || !avatar.avatarMime) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(avatar.avatarData), {
    headers: {
      "Content-Type": avatar.avatarMime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
