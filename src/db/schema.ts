import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  uid: text("uid").notNull().default(""),
  bio: text("bio").notNull().default(""),
  avatarColor: text("avatar_color").notNull().default("#ff6a00"),
  xp: integer("xp").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  isBot: boolean("is_bot").notNull().default(false),
  founder: boolean("founder").notNull().default(false),
  isDev: boolean("is_dev").notNull().default(false),
  strikes: integer("strikes").notNull().default(0),
  lastStrikeAt: timestamp("last_strike_at", { withTimezone: true }),
  mutedUntil: timestamp("muted_until", { withTimezone: true }),
  banned: boolean("banned").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", { key: text("key").primaryKey(), value: text("value").notNull() });
export const waitlist = pgTable("waitlist", { id: serial("id").primaryKey(), nickname: text("nickname").notNull().unique(), note: text("note").notNull().default(""), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() });
export const sessions = pgTable("sessions", { id: serial("id").primaryKey(), token: text("token").notNull().unique(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() });
export const rooms = pgTable("rooms", { id: serial("id").primaryKey(), slug: text("slug").notNull().unique(), name: text("name").notNull(), description: text("description").notNull().default(""), icon: text("icon").notNull().default("🔥"), color: text("color").notNull().default("#ff6a00"), isVault: boolean("is_vault").notNull().default(false), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() });
export const messages = pgTable("messages", { id: serial("id").primaryKey(), roomId: integer("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), content: text("content").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (t) => [index("messages_room_id_idx").on(t.roomId, t.id), index("messages_user_created_idx").on(t.userId, t.createdAt), index("messages_created_at_idx").on(t.createdAt)]);
export const topics = pgTable("topics", { id: serial("id").primaryKey(), title: text("title").notNull(), content: text("content").notNull(), category: text("category").notNull().default("general"), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), likes: integer("likes").notNull().default(0), replyCount: integer("reply_count").notNull().default(0), pinned: boolean("pinned").notNull().default(false), lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (t) => [index("topics_activity_idx").on(t.lastActivityAt), index("topics_category_idx").on(t.category)]);
export const replies = pgTable("replies", { id: serial("id").primaryKey(), topicId: integer("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), content: text("content").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (t) => [index("replies_topic_idx").on(t.topicId)]);
export const friendships = pgTable("friendships", { id: serial("id").primaryKey(), requesterId: integer("requester_id").notNull().references(() => users.id, { onDelete: "cascade" }), addresseeId: integer("addressee_id").notNull().references(() => users.id, { onDelete: "cascade" }), status: text("status").notNull().default("pending"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (t) => [index("friendships_pair_idx").on(t.requesterId, t.addresseeId), index("friendships_addressee_idx").on(t.addresseeId, t.status)]);
export const blocks = pgTable("blocks", { id: serial("id").primaryKey(), blockerId: integer("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }), blockedId: integer("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (t) => [index("blocks_pair_idx").on(t.blockerId, t.blockedId), index("blocks_blocked_idx").on(t.blockedId)]);
export const directMessages = pgTable("direct_messages", { id: serial("id").primaryKey(), senderId: integer("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }), recipientId: integer("recipient_id").notNull().references(() => users.id, { onDelete: "cascade" }), content: text("content").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (t) => [index("dm_out_idx").on(t.senderId, t.recipientId, t.id), index("dm_in_idx").on(t.recipientId, t.senderId, t.id), index("dm_created_idx").on(t.createdAt)]);
export const vaultAccess = pgTable("vault_access", { id: serial("id").primaryKey(), token: text("token").notNull().unique(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() });
export const voiceNotes = pgTable("voice_notes", { id: serial("id").primaryKey(), roomId: integer("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), data: bytea("data").notNull(), mime: text("mime").notNull().default("audio/webm"), durationMs: integer("duration_ms").notNull().default(0), createdAt: timestamp("created_at").notNull().defaultNow() }, (t) => [index("voice_notes_room_created_idx").on(t.roomId, t.createdAt)]);
export const topicLikes = pgTable("topic_likes", { id: serial("id").primaryKey(), topicId: integer("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), createdAt: timestamp("created_at").notNull().defaultNow() }, (t) => [index("topic_likes_unique_idx").on(t.topicId, t.userId)]);
