import { desc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { serializeUser } from "@/lib/utils";
import { Leaderboard } from "./leaderboard";

export const dynamic = "force-dynamic";

export const metadata = { title: "Leaderboard" };

export default async function PlayersPage() {
  const [byXp, byLikes] = await Promise.all([
    db.select().from(users).orderBy(desc(users.xp)).limit(50),
    db.select().from(users).orderBy(desc(users.likes)).limit(25),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-center font-hud text-xs font-bold uppercase tracking-[0.3em] text-zinc-500">
        rank · live
      </p>
      <h1 className="mt-2 text-center font-display text-4xl tracking-tight text-white sm:text-5xl">
        Members.
      </h1>
      <p className="mt-3 text-center text-sm text-zinc-500">
        Every message, topic and reply earns XP — from Newcomer to Legend,
        earned in the open.
      </p>
      <Leaderboard
        byXp={byXp.map((u) => serializeUser(u))}
        byLikes={byLikes.map((u) => serializeUser(u))}
      />
    </div>
  );
}
