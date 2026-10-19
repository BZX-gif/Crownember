import Link from "next/link";
import { Avatar, DevChip, FounderChip, RankBadge } from "@/components/ui";
import { TopicActions } from "@/components/topic-actions";
import { CategoryChip, CategoryGlyph } from "@/components/primitives";
import { PinIcon } from "@/components/icons";
import { categoryMeta, cn, excerpt, timeAgo, type PublicUser, type TopicDTO } from "@/lib/utils";

export function PostRow({
  topic,
  user,
  liked,
  variant = "feed",
  className,
}: {
  topic: TopicDTO;
  user: PublicUser | null;
  liked: boolean;
  variant?: "feed" | "forum";
  className?: string;
}) {
  const meta = categoryMeta(topic.category);

  return (
    <article
      id={`post-${topic.id}`}
      className={cn("group px-1 py-5 sm:px-2", className)}
    >
      <div className="flex gap-3.5">
        <Link
          href={`/players/${encodeURIComponent(topic.author.username)}`}
          className="mt-0.5 shrink-0 rounded-full"
          aria-label={`${topic.author.username}'s profile`}
        >
          <Avatar name={topic.author.username} size={variant === "forum" ? 34 : 32} dev={topic.author.dev} />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <Link
              href={`/players/${encodeURIComponent(topic.author.username)}`}
              className="font-medium text-fg transition-colors hover:text-white"
            >
              {topic.author.username}
            </Link>
            <RankBadge rank={topic.author.rank} size="xs" />
            {topic.author.founder && <FounderChip size="xs" />}
            {topic.author.dev && <DevChip size="xs" />}
            <span className="text-subtle" aria-hidden="true">·</span>
            <time
              dateTime={new Date(topic.createdAt).toISOString()}
              className="text-subtle"
            >
              {timeAgo(topic.createdAt)}
            </time>
            {topic.pinned && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted">
                <PinIcon size={11} /> Pinned
              </span>
            )}
          </div>

          <Link href={`/forum/${topic.id}`} className="mt-1.5 block">
            <h3 className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-fg transition-colors group-hover:text-white sm:text-lg">
              {topic.title}
            </h3>
          </Link>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">
            {excerpt(topic.content, variant === "forum" ? 240 : 200)}
          </p>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="hidden sm:block">
              <CategoryChip icon={meta.icon} label={meta.label} />
            </span>
            <TopicActions
              topicId={topic.id}
              initialLikes={topic.likes}
              initiallyLiked={liked}
              replyCount={topic.replyCount}
              user={user}
            />
          </div>

          <div className="mt-2 sm:hidden">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-subtle">
              <CategoryGlyph icon={meta.icon} size={12} /> {meta.label}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
