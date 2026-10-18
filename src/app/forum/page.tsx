import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TopicList } from "@/components/topic-list";
import { NewTopicForm } from "@/app/forum/new/new-topic-form";
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

export const metadata = {
  title: "The Feed",
  description:
    "The VYRON feed — permanent posts, real replies, effortless likes. Chronological, always.",
};

const PAGE_SIZE = 50;

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

  const rows = await db
    .select({ topic: topics, author: users })
    .from(topics)
    .innerJoin(users, eq(topics.userId, users.id))
    .where(where)
    .orderBy(desc(topics.pinned), desc(topics.lastActivityAt))
    .limit(PAGE_SIZE);

  // Only fetch like-state for the posts actually on screen (bounded).
  const pageIds = rows.map((r) => r.topic.id);
  const likedIds = new Set<number>();
  if (user && pageIds.length > 0) {
    const likedRows = await db
      .select({ topicId: topicLikes.topicId })
      .from(topicLikes)
      .where(
        and(eq(topicLikes.userId, user.id), inArray(topicLikes.topicId, pageIds)),
      );
    for (const r of likedRows) likedIds.add(r.topicId);
  }

  // The block veil: sealed members' posts disappear from the feed.
  const hidden = user ? await getHiddenUserIds(user.id) : new Set<number>();
  const topicDtos: TopicDTO[] = rows
    .filter((r) => !hidden.has(r.author.id))
    .map((r) => serializeTopic(r.topic, r.author));

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-hud text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-600">
            permanent · chronological
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-white">
            The Feed
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Rooms fade after three hours. What matters lives here.
          </p>
        </div>
        {!user && (
          <Link
            href="/register"
            className="rounded-full bg-zinc-100 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white"
          >
            Join VYRON
          </Link>
        )}
      </div>

      {user && (
        <div className="mt-8">
          <NewTopicForm user={serializeUser(user)} compact />
        </div>
      )}

      <nav
        aria-label="Feed categories"
        className="nice-scroll -mx-4 mt-8 flex gap-1.5 overflow-x-auto px-4 pb-2"
      >
        <Link
          href="/forum"
          className={cn(
            "shrink-0 rounded-full border px-4 py-2 font-hud text-[11px] font-bold uppercase tracking-[0.15em] transition",
            !category
              ? "border-white/50 bg-zinc-100 text-black"
              : "border-white/12 text-zinc-400 hover:border-white/30 hover:text-zinc-200",
          )}
        >
          All
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            href={`/forum?category=${c.slug}`}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 font-hud text-[11px] font-bold uppercase tracking-[0.15em] transition",
              category === c.slug
                ? "border-white/50 bg-zinc-100 text-black"
                : "border-white/12 text-zinc-400 hover:border-white/30 hover:text-zinc-200",
            )}
          >
            {c.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8">
        <TopicList
          topics={topicDtos}
          likedIds={[...likedIds]}
          user={user ? serializeUser(user) : null}
        />
      </div>
    </div>
  );
}
