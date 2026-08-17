import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { voiceNotes } from "@/db/schema";

/**
 * Someone left The Vault → every voice note burns instantly.
 * Fired via sendBeacon on tab close / room exit, so no auth header is
 * required — the worst an outsider can do is erase ephemeral audio,
 * which is exactly what this room promises anyway.
 */
export async function POST() {
  const burned = await db
    .delete(voiceNotes)
    .returning({ id: voiceNotes.id });
  return NextResponse.json({ burned: burned.length });
}
