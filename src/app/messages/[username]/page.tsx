import { and, desc, eq, gte, or } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DmThread } from "@/components/dm-thread";
import { db } from "@/db";
import { directMessages } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { messageCutoff } from "@/lib/retention";
import { findUserByUsername, getBlockState } from "@/lib/social";
import { serializeUser } from "@/lib/utils";

export const dynamic = "force-dynamic";

const EDIT_WINDOW_MS = 3 * 60 * 1000;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `Message ${username}` };
}

/** Convert rows to the client shape; the edit window is read outside render. */
function toClientMessages(
  rows: (typeof directMessages.$inferSelect)[],
  meId: number,
) {
  const now = Date.now();
  return rows.map((message) => {
    const mine = message.senderId === meId;
    return {
      id: message.id,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      mine,
      editable: mine && now - message.createdAt.getTime() < EDIT_WINDOW_MS,
    };
  });
}

export default async function DmPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const me = await getSessionUser();
  if (!me) redirect("/login");

  const other = await findUserByUsername(username);
  if (!other || other.id === me.id) notFound();

  const block = await getBlockState(me.id, other.id);

  const messageRows = block.any
    ? []
    : (
        await db
          .select()
          .from(directMessages)
          .where(
            and(
              or(
                and(
                  eq(directMessages.senderId, me.id),
                  eq(directMessages.recipientId, other.id),
                ),
                and(
                  eq(directMessages.senderId, other.id),
                  eq(directMessages.recipientId, me.id),
                ),
              ),
              gte(directMessages.createdAt, messageCutoff()),
            ),
          )
          .orderBy(desc(directMessages.id))
          .limit(60)
      )
        .reverse();
  const initialMessages = block.any ? [] : toClientMessages(messageRows, me.id);

  return (
    <DmThread
      me={serializeUser(me)}
      other={serializeUser(other)}
      sealed={block.any}
      initialMessages={initialMessages}
    />
  );
}
