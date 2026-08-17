import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { voiceNotes } from "@/db/schema";
import { getVaultUser } from "@/lib/vault";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getVaultUser();
  if (!user) {
    return NextResponse.json(
      { error: "The Vault is sealed. 🔐" },
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
      { error: "This voice note has burned. 🔥" },
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
