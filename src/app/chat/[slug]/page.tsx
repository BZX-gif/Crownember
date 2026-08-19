import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatRoom } from "@/components/chat-room";
import { GlobalChatActions } from "@/components/global-chat-actions";
import { VaultGate } from "@/components/vault-gate";
import { db } from "@/db";
import { rooms } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { serializeUser } from "@/lib/utils";
import { getVaultPasscodeHash, getVaultUser } from "@/lib/vault";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const room = await db
    .select({ name: rooms.name })
    .from(rooms)
    .where(eq(rooms.slug, slug))
    .limit(1);
  return { title: room[0] ? room[0].name : "Chat" };
}

/**
 * A thread owns the entire screen — no site chrome at all.
 * Back arrow returns to the inbox, like any dedicated messaging app.
 */
export default async function RoomPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [user, room] = await Promise.all([
    getSessionUser(),
    db.select().from(rooms).where(eq(rooms.slug, slug)).limit(1),
  ]);

  if (!room[0]) notFound();

  const isVault = room[0].isVault;
  const [vaultUser, vaultHash] = await Promise.all([
    isVault ? getVaultUser() : Promise.resolve(null),
    isVault ? getVaultPasscodeHash() : Promise.resolve(null),
  ]);

  const current = room[0];

  if (isVault && !vaultUser) {
    return (
      <div className="bg-grid flex h-[100dvh] items-center justify-center overflow-y-auto p-4">
        <div className="w-full max-w-md">
          <VaultGate
            needsSetup={!vaultHash}
            isFounder={Boolean(user?.founder)}
            username={user?.username ?? null}
          />
          <a
            href="/chat"
            className="mt-4 block text-center font-hud text-xs font-bold uppercase tracking-widest text-slate-500 transition hover:text-orange-400"
          >
            ← back to inbox
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <ChatRoom
        room={{
          slug: current.slug,
          name: current.name,
          description: current.description,
          icon: current.icon,
          color: current.color,
        }}
        user={user ? serializeUser(user) : null}
        vault={isVault}
        vaultIsFounder={Boolean(user?.founder)}
      />
      {!isVault && <GlobalChatActions />}
    </>
  );
}
