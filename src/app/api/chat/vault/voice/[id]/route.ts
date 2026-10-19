import { eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { voiceNotes } from "@/db/schema";
import { getVaultUser } from "@/lib/vault";

const VOICE_TTL_MS = 10 * 60 * 1000; // must match the list route's ceiling

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getVaultUser();
  if (!user) {
    return NextResponse.json(
      { error: "The Vault is sealed." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const noteId = Number(id);
  if (!Number.isInteger(noteId)) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(voiceNotes)
    .where(eq(voiceNotes.id, noteId))
    .limit(1);
  const note = rows[0];
  if (!note) {
    // Already burned — that's the promise.
    return NextResponse.json(
      { error: "This voice note has expired." },
      { status: 410 },
    );
  }

  // Enforce the burn ceiling on read too — a note past its TTL is gone
  // even if no list request got around to purging it yet.
  if (Date.now() - note.createdAt.getTime() > VOICE_TTL_MS) {
    await db.delete(voiceNotes).where(eq(voiceNotes.id, noteId));
    return NextResponse.json(
      { error: "This voice note has expired." },
      { status: 410 },
    );
  }

  return new Response(new Uint8Array(note.data), {
    headers: {
      "Content-Type": note.mime,
      "Cache-Control": "no-store",
    },
  });
}
