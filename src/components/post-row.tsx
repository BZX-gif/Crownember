import Link from "next/link";
import { Avatar, DevChip, FounderChip, RankBadge } from "@/components/ui";
import { TopicActions } from "@/components/topic-actions";
import { CategoryGlyph } from "@/components/primitives";
import { PinIcon } from "@/components/icons";
import { RelativeTime } from "@/components/relative-time";
import { avatarUrlFor, categoryMeta, cn, excerpt, type PublicUser, type TopicDTO } from "@/lib/utils";

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
          aria-hidden="true"
          tabIndex={-1}
        >
          <Avatar name={topic.author.username} size={variant === "forum" ? 34 : 32} dev={topic.author.dev} avatarUrl={avatarUrlFor(topic.author)} />
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
            <RelativeTime date={topic.createdAt} className="text-subtle" />
            {topic.pinned && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted">
                <PinIcon size={11} /> Pinned
              </span>
            )}
          </div>

          <Link href={`/forum/${topic.id}`} className="mt-1.5 block">
            <h3 className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-fg transition-colors group-hover:text-white sm:text-lg [overflow-wrap:anywhere]">
              {topic.title}
            </h3>
          </Link>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted [overflow-wrap:anywhere]">
            {excerpt(topic.content, variant === "forum" ? 240 : 200)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-subtle">
              <CategoryGlyph icon={meta.icon} size={12} /> {meta.label}
            </span>
            <span aria-hidden="true" className="hidden h-3 w-px bg-line sm:block" />
            <TopicActions
              topicId={topic.id}
              initialLikes={topic.likes}
              initiallyLiked={liked}
              replyCount={topic.replyCount}
              user={user}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
