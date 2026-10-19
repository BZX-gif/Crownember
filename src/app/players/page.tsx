import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { users } from "@/db/schema";
import { serializeUser } from "@/lib/utils";
import { PageHeader } from "@/components/primitives";
import { Leaderboard } from "./leaderboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "People",
  description: "The VYRON community, ranked by contribution and appreciation.",
};

export default async function PlayersPage() {
  const [byXp, byLikes] = await Promise.all([
    db
      .select()
      .from(users)
      .where(eq(users.isBot, false))
      .orderBy(desc(users.xp), desc(users.id))
      .limit(50),
    db
      .select()
      .from(users)
      .where(eq(users.isBot, false))
      .orderBy(desc(users.likes), desc(users.id))
      .limit(25),
  ]);

  return (
    <div className="page-shell max-w-4xl py-9 sm:py-12">
      <PageHeader
        eyebrow="People"
        title="The community, by contribution."
        description="Reputation is earned by showing up: writing, replying and being appreciated by other members. It cannot be bought or seeded."
      />
      <Leaderboard
        byXp={byXp.map((u) => serializeUser(u))}
        byLikes={byLikes.map((u) => serializeUser(u))}
      />
    </div>
  );
}
