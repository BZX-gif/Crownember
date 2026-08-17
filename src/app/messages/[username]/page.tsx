import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DmThread } from "@/components/dm-thread";
import { getSessionUser } from "@/lib/auth";
import {
  findUserByUsername,
  getBlockState,
} from "@/lib/social";
import { serializeUser } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `${username} — DM` };
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

  return (
    <DmThread
      me={serializeUser(me)}
      other={serializeUser(other)}
      sealed={block.any}
    />
  );
}
