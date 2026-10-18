import { NextResponse } from "next/server";
import { db } from "@/db";
import { voiceNotes } from "@/db/schema";
import { getVaultUser } from "@/lib/vault";

/**
 * Someone left The Vault → every voice note burns instantly.
 * Fired via sendBeacon on tab close / room exit. sendBeacon sends cookies,
 * so the vault token travels with it — outsiders get a 403 and cannot
 * grief the room by burning other people's voice notes from outside.
 */
export async function POST() {
  const user = await getVaultUser();
  if (!user) {
    return NextResponse.json(
      { error: "The Vault is sealed. 🔐" },
      { status: 403 },
    );
  }
  const burned = await db
    .delete(voiceNotes)
    .returning({ id: voiceNotes.id });
  return NextResponse.json({ burned: burned.length });
}
