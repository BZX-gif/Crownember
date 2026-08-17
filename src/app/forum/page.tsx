import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { TopicList } from "@/components/topic-list";
import { db } from "@/db";
import { topicLikes, topics, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { getHiddenUserIds } from "@/lib/social";
import {
  CATEGORIES,
  cn,
  serializeTopic,
  serializeUser,
  type TopicDTO,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Forum" };

export default async function ForumPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const user = await getSessionUser();

  const where =
    category && CATEGORIES.some((c) => c.slug === category)
      ? eq(topics.category, category)
      : undefined;

  const [rows, likedRows] = await Promise.all([
    db
      .select({ topic: topics, author: users })
      .from(topics)
      .innerJoin(users, eq(topics.userId, users.id))
      .where(where)
      .orderBy(desc(topics.pinned), desc(topics.lastActivityAt))
      .limit(50),
    user
      ? db
          .select({ topicId: topicLikes.topicId })
          .from(topicLikes)
          .where(eq(topicLikes.userId, user.id))
      : Promise.resolve([]),
  ]);

  const likedIds = likedRows.map((r) => r.topicId);
  // The block veil: sealed players' topics disappear from the forum.
  const hidden = user ? await getHiddenUserIds(user.id) : new Set<number>();
  const topicDtos: TopicDTO[] = rows
    .filter((r) => !hidden.has(r.author.id))
    .map((r) => serializeTopic(r.topic, r.author));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-hud text-xs font-bold uppercase tracking-[0.3em] text-orange-400">
            // permanent archive
          </p>
          <h1 className="mt-2 font-display text-4xl uppercase text-white">
            Community <span className="text-fire">Forum</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Chat burns in 3 hours — the forum keeps it forever. Start a topic,
            earn +10 XP.
          </p>
        </div>
        <Link
          href="/forum/new"
          className="clip-btn bg-gradient-to-r from-orange-500 to-amber-400 px-6 py-3 font-display text-xs uppercase tracking-widest text-slate-950 transition hover:-translate-y-0.5 hover:brightness-110"
        >
          ✍️ New Topic
        </Link>
      </div>

      <div className="nice-scroll mt-6 flex gap-2 overflow-x-auto pb-2">
        <Link
          href="/forum"
          className={cn(
            "shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition",
            !category
              ? "border-orange-500/50 bg-orange-500/15 text-orange-400"
              : "border-white/10 bg-white/5 text-slate-300 hover:border-white/25",
          )}
        >
          🔥 All Topics
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            href={`/forum?category=${c.slug}`}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition",
              category === c.slug
                ? "border-orange-500/50 bg-orange-500/15 text-orange-400"
                : "border-white/10 bg-white/5 text-slate-300 hover:border-white/25",
            )}
          >
            {c.icon} {c.label}
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <TopicList
          topics={topicDtos}
          likedIds={likedIds}
          user={user ? serializeUser(user) : null}
        />
      </div>
    </div>
  );
}
