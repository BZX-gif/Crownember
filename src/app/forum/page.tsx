import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { topicLikes, topics, users } from "@/db/schema";
import { PostRow } from "@/components/post-row";
import {
  CategoryGlyph,
  EmptyState,
  PageHeader,
  buttonClass,
} from "@/components/primitives";
import { ArrowLeftIcon, ArrowRightIcon, ForumIcon, PencilIcon } from "@/components/icons";
import { getSessionUser } from "@/lib/auth";
import { getHiddenUserIds } from "@/lib/social";
import { CATEGORIES, cn, serializeTopic, serializeUser, type TopicDTO } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Forum",
  description: "The permanent record of VYRON: ideas, questions and conversations.",
};

const PAGE_SIZE = 20;

function forumHref(params: { category?: string; sort?: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.category) search.set("category", params.category);
  if (params.sort === "popular") search.set("sort", "popular");
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/forum?${query}` : "/forum";
}

export default async function ForumPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string; page?: string }>;
}) {
  const { category, sort, page: pageParam } = await searchParams;
  const user = await getSessionUser();
  const popular = sort === "popular";
  const page = Math.max(1, Math.min(500, Number(pageParam) || 1));
  const validCategory = CATEGORIES.some((c) => c.slug === category)
    ? category
    : undefined;

  const where = validCategory
    ? and(eq(users.isBot, false), eq(topics.category, validCategory))
    : eq(users.isBot, false);

  const rows = await db
    .select({ topic: topics, author: users })
    .from(topics)
    .innerJoin(users, eq(topics.userId, users.id))
    .where(where)
    .orderBy(
      desc(topics.pinned),
      popular ? desc(topics.likes) : desc(topics.lastActivityAt),
      desc(topics.lastActivityAt),
    )
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);

  const hidden = user ? await getHiddenUserIds(user.id) : new Set<number>();
  const visible = rows.filter((row) => !hidden.has(row.author.id));
  const hasNext = visible.length > PAGE_SIZE;
  const pageRows = visible.slice(0, PAGE_SIZE);
  const topicIds = pageRows.map((r) => r.topic.id);
  const likedRows =
    user && topicIds.length > 0
      ? await db
          .select({ topicId: topicLikes.topicId })
          .from(topicLikes)
          .where(and(eq(topicLikes.userId, user.id), inArray(topicLikes.topicId, topicIds)))
      : [];
  const liked = new Set(likedRows.map((r) => r.topicId));
  const publicUser = user ? serializeUser(user) : null;

  const dir = {
    category: validCategory,
    sort: popular ? "popular" : undefined,
  };

  return (
    <div className="page-shell py-9 sm:py-12">
      <PageHeader
        eyebrow="Forum"
        title="Conversations that stay."
        description="Rooms clear in hours. The forum keeps the ideas, questions and answers worth returning to."
        action={
          <Link
            href={publicUser ? "/forum/new" : "/register"}
            className={buttonClass("primary", "md")}
          >
            <PencilIcon size={15} />
            {publicUser ? "New post" : "Join to post"}
          </Link>
        }
      />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Categories" className="nice-scroll flex gap-1.5 overflow-x-auto pb-1">
          <Link
            href={forumHref({ sort: dir.sort })}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
              !validCategory
                ? "border-line-strong bg-white/[0.07] text-fg"
                : "border-line text-muted hover:border-line-strong hover:text-fg",
            )}
          >
            All
          </Link>
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={forumHref({ category: c.slug, sort: dir.sort })}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                validCategory === c.slug
                  ? "border-line-strong bg-white/[0.07] text-fg"
                  : "border-line text-muted hover:border-line-strong hover:text-fg",
              )}
            >
              <CategoryGlyph icon={c.icon} size={12} />
              {c.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-0.5 rounded-lg border border-line p-0.5">
          <Link
            href={forumHref({ category: dir.category })}
            className={cn(
              "inline-flex h-8 items-center rounded-md px-3 text-xs font-medium transition-colors",
              popular ? "text-muted hover:text-fg" : "bg-white/[0.06] text-fg",
            )}
          >
            Latest
          </Link>
          <Link
            href={forumHref({ category: dir.category, sort: "popular" })}
            className={cn(
              "inline-flex h-8 items-center rounded-md px-3 text-xs font-medium transition-colors",
              popular ? "bg-white/[0.06] text-fg" : "text-muted hover:text-fg",
            )}
          >
            Popular
          </Link>
        </div>
      </div>

      {pageRows.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<ForumIcon size={18} />}
          title={page > 1 ? "Nothing older than this" : "No conversations yet"}
          description={
            page > 1
              ? "You have reached the end of the archive."
              : "VYRON does not manufacture posts or engagement. The first real conversation can start here."
          }
          action={
            page > 1 ? (
              <Link href={forumHref(dir)} className={buttonClass("secondary", "sm")}>
                Back to the latest
              </Link>
            ) : (
              <Link
                href={publicUser ? "/forum/new" : "/register"}
                className={buttonClass("primary", "sm")}
              >
                {publicUser ? "Start a conversation" : "Join VYRON"}
              </Link>
            )
          }
        />
      ) : (
        <div className="mt-5 divide-y divide-line border-y border-line">
          {pageRows.map(({ topic, author }) => (
            <PostRow
              key={topic.id}
              topic={serializeTopic(topic, author) as TopicDTO}
              user={publicUser}
              liked={liked.has(topic.id)}
              variant="forum"
            />
          ))}
        </div>
      )}

      {(page > 1 || hasNext) && (
        <nav
          aria-label="Forum pages"
          className="mt-6 flex items-center justify-between gap-4"
        >
          {page > 1 ? (
            <Link
              href={forumHref({ ...dir, page: page - 1 })}
              className={buttonClass("secondary", "sm")}
            >
              <ArrowLeftIcon size={14} /> Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="mono-meta">Page {page}</span>
          {hasNext ? (
            <Link
              href={forumHref({ ...dir, page: page + 1 })}
              className={buttonClass("secondary", "sm")}
            >
              Older <ArrowRightIcon size={14} />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
