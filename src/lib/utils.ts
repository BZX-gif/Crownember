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

const AVATAR_COLORS = [
  "#ff6a00",
  "#f43f5e",
  "#8b5cf6",
  "#0ea5e9",
  "#10b981",
  "#eab308",
  "#ec4899",
  "#14b8a6",
];

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

export interface PublicUser {
  id: number;
  username: string;
  uid: string;
  bio: string;
  avatarColor: string;
  xp: number;
  likes: number;
  createdAt: Date;
  founder: boolean;
  dev: boolean;
  rank: RankInfo;
}

export function serializeUser(u: typeof users.$inferSelect): PublicUser {
  return {
    id: u.id,
    username: u.username,
    uid: u.uid,
    bio: u.bio,
    avatarColor: u.avatarColor,
    xp: u.xp,
    likes: u.likes,
    createdAt: u.createdAt,
    founder: u.founder,
    dev: u.isDev,
    rank: getRank(u.xp),
  };
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

export const CATEGORIES = [
  { slug: "general", label: "General", icon: "💬" },
  { slug: "tips", label: "Tips & Tricks", icon: "🎯" },
  { slug: "squad", label: "Squad Up", icon: "🤝" },
  { slug: "tournament", label: "Tournaments", icon: "🏆" },
  { slug: "memes", label: "Memes & Fun", icon: "😂" },
  { slug: "news", label: "Bugs & News", icon: "📣" },
] as const;

export function categoryMeta(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug) ?? CATEGORIES[0];
}
