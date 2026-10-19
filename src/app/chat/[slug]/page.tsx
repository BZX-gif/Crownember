import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatRoom } from "@/components/chat-room";
import { VaultGate } from "@/components/vault-gate";
import { Brand } from "@/components/brand";
import { buttonClass } from "@/components/primitives";
import { ArrowLeftIcon } from "@/components/icons";
import { db } from "@/db";
import { rooms } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { getRoomMessages, getRoomOnlineCount, getRoomReactions } from "@/lib/chat";
import { roomDisplay } from "@/lib/rooms";
import { serializeMessage, serializeUser } from "@/lib/utils";
import { getVaultPasscodeHash, getVaultUser } from "@/lib/vault";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const rows = await db
    .select({ slug: rooms.slug, name: rooms.name, isVault: rooms.isVault, description: rooms.description })
    .from(rooms)
    .where(eq(rooms.slug, slug))
    .limit(1);
  const room = rows[0];
  if (!room) return { title: "Chat" };
  const display = roomDisplay(room);
  return { title: display.name, description: display.description };
}

export default async function RoomPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [user, roomRows] = await Promise.all([
    getSessionUser(),
    db.select().from(rooms).where(eq(rooms.slug, slug)).limit(1),
  ]);
  const room = roomRows[0];
  if (!room) notFound();

  const isVault = room.isVault;
  const [vaultUser, vaultHash] = await Promise.all([
    isVault ? getVaultUser() : Promise.resolve(null),
    isVault ? getVaultPasscodeHash() : Promise.resolve(null),
  ]);

  if (isVault && !vaultUser) {
    return (
      <div className="nice-scroll flex min-h-[100dvh] flex-col bg-ink">
        <header
          className="border-b border-line"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
            <Link href="/" aria-label="VYRON home">
              <Brand />
            </Link>
            <Link href="/chat" className={buttonClass("ghost", "sm", "h-8 px-2.5")}>
              <ArrowLeftIcon size={14} /> Rooms
            </Link>
          </div>
        </header>
        <div className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-md">
            <VaultGate
              needsSetup={!vaultHash}
              isFounder={Boolean(user?.founder)}
              username={user?.username ?? null}
            />
          </div>
        </div>
      </div>
    );
  }

  const [initialRows, initialReactions, online] = await Promise.all([
    getRoomMessages(room.id, isVault),
    getRoomReactions(room.id, user?.id ?? null),
    getRoomOnlineCount(room.id),
  ]);

  const display = roomDisplay(room);

  return (
    <ChatRoom
      room={{
        slug: room.slug,
        name: display.name,
        description: display.description,
        retention: display.retention,
        isVault,
      }}
      user={user ? serializeUser(user) : null}
      initialMessages={initialRows.map((row) => serializeMessage(row.message, row.author))}
      initialReactions={initialReactions}
      initialOnline={online}
    />
  );
}
