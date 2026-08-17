import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar, DevChip, FounderChip, RankBadge } from "@/components/ui";
import { db } from "@/db";
import { replies, topics, users } from "@/db/schema";
import { categoryMeta, formatDate, timeAgo } from "@/lib/utils";
import { getRank } from "@/lib/ranks";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `${username} — Player Profile` };
}

/**
 * Privacy rule: a profile shows rank, stats and PUBLIC forum topics only.
 * Chat messages are never exposed on profiles — chat is ephemeral and
 * private, and skipping that query keeps storage and load lean.
 */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  const profile = rows[0];
  if (!profile) notFound();

  const [counts, recentTopics] = await Promise.all([
    db.execute(sql`
      select
        (select count(*)::int from topics where user_id = ${profile.id}) as topics,
        (select count(*)::int from replies where user_id = ${profile.id}) as replies
    `),
    db
      .select({ topic: topics })
      .from(topics)
      .where(eq(topics.userId, profile.id))
      .orderBy(desc(topics.id))
      .limit(8),
  ]);

  const rank = getRank(profile.xp);
  const stats = counts.rows[0] as unknown as {
    topics: number;
    replies: number;
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
      {/* Profile header */}
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70">
        <div
          className="h-24 sm:h-28"
          style={{
            background: `linear-gradient(120deg, ${profile.avatarColor}55, ${profile.avatarColor}11)`,
          }}
        />
        <div className="px-5 pb-6 sm:px-8">
          <div className="-mt-11 flex flex-wrap items-end gap-4">
            <Avatar
              name={profile.username}
              color={profile.avatarColor}
              size={88}
              dev={profile.isDev}
              className="border-4 border-slate-950"
            />
            <div className="flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black">{profile.username}</h1>
                <RankBadge rank={rank} size="md" />
                {profile.founder && <FounderChip size="md" />}
                {profile.isDev && <DevChip size="sm" />}
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Level {rank.level} · Joined {formatDate(profile.createdAt)}
                {profile.uid ? ` · UID ${profile.uid}` : ""}
              </p>
            </div>
          </div>

          {profile.bio && (
            <p className="mt-4 text-[15px] leading-relaxed text-slate-300">
              {profile.bio}
            </p>
          )}

          {/* Rank progress */}
          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold" style={{ color: rank.color }}>
                {rank.icon} {rank.name}
              </span>
              <span className="text-slate-400">
                {rank.nextMinXp !== null
                  ? `${profile.xp.toLocaleString()} / ${rank.nextMinXp.toLocaleString()} XP`
                  : `${profile.xp.toLocaleString()} XP — max rank!`}
              </span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${rank.progress * 100}%`,
                  background: `linear-gradient(90deg, ${rank.color}, #ff6a00)`,
                }}
              />
            </div>
            {rank.nextMinXp !== null && (
              <p className="mt-1.5 text-xs text-slate-500">
                {rank.nextMinXp - profile.xp} XP to the next rank — keep
                chatting! 🔥
              </p>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-3">
            {[
              { label: "Topics", value: stats.topics, icon: "✍️" },
              { label: "Replies", value: stats.replies, icon: "↩️" },
              { label: "Likes", value: profile.likes, icon: "❤️" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-center"
              >
                <dd className="text-xl font-black text-white sm:text-2xl">
                  {s.icon} {s.value.toLocaleString()}
                </dd>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {s.label}
                </dt>
              </div>
            ))}
          </dl>

          <p className="mt-3 text-center font-hud text-[10px] uppercase tracking-wider text-slate-600">
            🔒 chat history is private — never shown on profiles
          </p>
        </div>
      </div>

      {/* Public topics only */}
      <section className="mt-8">
        <h2 className="text-lg font-black">✍️ Topics Started</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {recentTopics.length === 0 && (
            <p className="rounded-xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-500">
              No topics yet.
            </p>
          )}
          {recentTopics.map(({ topic }) => {
            const meta = categoryMeta(topic.category);
            return (
              <Link
                key={topic.id}
                href={`/forum/${topic.id}`}
                className="block rounded-xl border border-white/10 bg-slate-900/60 p-4 transition hover:border-orange-500/30"
              >
                <p className="text-xs text-slate-500">
                  {meta.icon} {meta.label} · {timeAgo(topic.createdAt)}
                </p>
                <p className="mt-1 font-bold text-slate-100">{topic.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  ❤️ {topic.likes} · 💬 {topic.replyCount}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
