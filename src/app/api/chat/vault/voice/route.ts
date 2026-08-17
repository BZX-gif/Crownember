import { asc, eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { rooms, users, voiceNotes } from "@/db/schema";
import {
  checkRateLimit,
  tooManyRequests,
} from "@/lib/rate-limit";
import { getVaultUser } from "@/lib/vault";

const VOICE_TTL_MS = 10 * 60 * 1000; // hard ceiling even if nobody leaves
const MAX_AUDIO_BYTES = 300_000; // ~25s of opus
const MAX_DURATION_MS = 25_000;

async function purgeStaleNotes() {
  await db
    .delete(voiceNotes)
    .where(lt(voiceNotes.createdAt, new Date(Date.now() - VOICE_TTL_MS)));
}

async function getVaultRoomId(): Promise<number | null> {
  const rows = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(eq(rooms.isVault, true))
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function GET() {
  const user = await getVaultUser();
  if (!user) {
    return NextResponse.json(
      { error: "The Vault is sealed. 🔐" },
      { status: 403 },
    );
  }
  const roomId = await getVaultRoomId();
  if (!roomId) {
    return NextResponse.json({ error: "Vault room missing." }, { status: 404 });
  }

  await purgeStaleNotes();

  const rows = await db
    .select({
      note: voiceNotes,
      author: users,
    })
    .from(voiceNotes)
    .innerJoin(users, eq(voiceNotes.userId, users.id))
    .where(eq(voiceNotes.roomId, roomId))
    .orderBy(asc(voiceNotes.id))
    .limit(20);

  return NextResponse.json({
    notes: rows.map((r) => ({
      id: r.note.id,
      durationMs: r.note.durationMs,
      createdAt: r.note.createdAt,
      author: {
        username: r.author.username,
        avatarColor: r.author.avatarColor,
      },
    })),
  });
}

export async function POST(req: Request) {
  const user = await getVaultUser();
  if (!user) {
    return NextResponse.json(
      { error: "The Vault is sealed. 🔐" },
      { status: 403 },
    );
  }
  const rl = checkRateLimit(`voice:${user.id}`, 10, 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "voice notes");

  const roomId = await getVaultRoomId();
  if (!roomId) {
    return NextResponse.json({ error: "Vault room missing." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const audioB64 = String(body.audio ?? "");
  const mime = String(body.mime ?? "audio/webm");
  const durationMs = Math.min(
    MAX_DURATION_MS,
    Math.max(0, Number(body.durationMs ?? 0) || 0),
  );

  if (!/^audio\/(webm|mp4|ogg)$/.test(mime)) {
    return NextResponse.json({ error: "Unsupported audio format." }, { status: 400 });
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(audioB64, "base64");
  } catch {
    return NextResponse.json({ error: "Invalid audio payload." }, { status: 400 });
  }
  if (buf.length === 0 || buf.length > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "Voice notes are limited to 25 seconds. 🎙️" },
      { status: 400 },
    );
  }
  if (durationMs < 300) {
    return NextResponse.json(
      { error: "That was too short — hold the mic a little longer." },
      { status: 400 },
    );
  }

  await purgeStaleNotes();
  const [created] = await db
    .insert(voiceNotes)
    .values({ roomId, userId: user.id, data: buf, mime, durationMs })
    .returning({ id: voiceNotes.id });

  return NextResponse.json({ id: created.id, durationMs });
}
