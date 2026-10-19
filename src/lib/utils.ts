import { getRank, type RankInfo } from "@/lib/ranks";
import type { messages, replies, topics, users } from "@/db/schema";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 15) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function excerpt(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`;
}

/** Neutral graphite palette — VYRON does not tint identities by hue. */
const AVATAR_COLORS = ["#27272a", "#303033", "#3a3a3f", "#44444a"];

export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Compact, cache-safe avatar version string. Accepts the row's
 * `avatar_version` timestamp (when the caller has it) and falls back to a
 * stable placeholder so the URL is still deterministic.
 */
export function avatarVersion(value?: Date | string | null): string {
  if (!value) return "0";
  const time = typeof value === "string" ? new Date(value) : value;
  return String(Math.floor(time.getTime() / 1000));
}

export interface PublicUser {
  id: number;
  username: string;
  bio: string;
  avatarColor: string;
  /** True only when the member has actually uploaded a profile picture. */
  hasAvatar: boolean;
  xp: number;
  likes: number;
  createdAt: Date;
  founder: boolean;
  dev: boolean;
  rank: RankInfo;
}

/**
 * The public shape of a member.
 * `uid` is deliberately NOT included: it is a legacy external identifier
 * that was being rendered on public leaderboards. It stays in the database
 * for account continuity but is never sent to a browser again.
 */
export function serializeUser(u: typeof users.$inferSelect): PublicUser {
  return {
    id: u.id,
    username: u.username,
    bio: u.bio,
    avatarColor: u.avatarColor,
    hasAvatar: Boolean(u.avatarMime),
    xp: u.xp,
    likes: u.likes,
    createdAt: u.createdAt,
    founder: u.founder,
    dev: u.isDev,
    rank: getRank(u.xp),
  };
}

/**
 * Return a profile-picture URL only when the member actually has one. The
 * avatar API answers 404 for everyone else, so rendering an <img> for every
 * name used to cost a failed request per avatar on every page.
 */
export function avatarUrlFor(
  user:
    | { username: string; hasAvatar?: boolean; avatarMime?: string | null }
    | null
    | undefined,
): string | undefined {
  const hasAvatar = user?.hasAvatar ?? Boolean(user?.avatarMime);
  if (!user || !hasAvatar) return undefined;
  return `/api/profile/avatar?username=${encodeURIComponent(user.username)}`;
}

export interface ChatMessageDTO {
  id: number;
  content: string;
  createdAt: Date;
  user: PublicUser;
}

export function serializeMessage(
  m: typeof messages.$inferSelect,
  author: typeof users.$inferSelect,
): ChatMessageDTO {
  return {
    id: m.id,
    content: m.content,
    createdAt: m.createdAt,
    user: serializeUser(author),
  };
}

export interface TopicDTO {
  id: number;
  title: string;
  content: string;
  category: string;
  likes: number;
  replyCount: number;
  pinned: boolean;
  createdAt: Date;
  lastActivityAt: Date;
  author: PublicUser;
}

export function serializeTopic(
  t: typeof topics.$inferSelect,
  author: typeof users.$inferSelect,
): TopicDTO {
  return {
    id: t.id,
    title: t.title,
    content: t.content,
    category: t.category,
    likes: t.likes,
    replyCount: t.replyCount,
    pinned: t.pinned,
    createdAt: t.createdAt,
    lastActivityAt: t.lastActivityAt,
    author: serializeUser(author),
  };
}

export interface ReplyDTO {
  id: number;
  content: string;
  createdAt: Date;
  author: PublicUser;
}

export function serializeReply(
  r: typeof replies.$inferSelect,
  author: typeof users.$inferSelect,
): ReplyDTO {
  return {
    id: r.id,
    content: r.content,
    createdAt: r.createdAt,
    author: serializeUser(author),
  };
}

/**
 * Category slugs are stored in the database, so they stay stable. Labels and
 * icons are presentation only and can evolve without a migration.
 */
export const CATEGORIES = [
  { slug: "general", label: "General", icon: "chat" },
  { slug: "tips", label: "Ideas", icon: "bulb" },
  { slug: "squad", label: "Connections", icon: "users" },
  { slug: "tournament", label: "Showcase", icon: "spark" },
  { slug: "memes", label: "Culture", icon: "smile" },
  { slug: "news", label: "Updates", icon: "megaphone" },
] as const;

export type CategoryIcon = (typeof CATEGORIES)[number]["icon"];

export function categoryMeta(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug) ?? CATEGORIES[0];
}
