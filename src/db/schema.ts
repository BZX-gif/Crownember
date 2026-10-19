import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
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
  // Profile pictures are stored outside this schema's write path (raw SQL in
  // /api/profile/avatar), but the public flag and version are read-only fields
  // every query needs so the UI never requests an avatar that does not exist.
  avatarMime: text("avatar_mime"),
  avatarVersion: timestamp("avatar_version", { withTimezone: true })
    .notNull()
    .defaultNow(),
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

/* ============================================================
   Private groups — Slice A.
   Groups are private by default: nothing here is readable by a
   non-member, and the authorization layer lives in
   src/lib/groups/permissions.ts. Public chat rooms (`messages`)
   are never reused for group content — Slice B adds a separate,
   member-only message store that hangs off `groups.id` the same
   way these tables do.
   ============================================================ */

export const GROUP_ROLES = ["owner", "admin", "member"] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export const GROUP_INVITATION_STATUSES = [
  "proposed",
  "invited",
  "accepted",
  "rejected",
  "revoked",
  "expired",
  "declined",
] as const;
export type GroupInvitationStatus = (typeof GROUP_INVITATION_STATUSES)[number];

/** Statuses that still represent a live, actionable invitation. */
export const OPEN_INVITATION_STATUSES: readonly GroupInvitationStatus[] = [
  "proposed",
  "invited",
];

export const groups = pgTable(
  "groups",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 'private' is the only value today; the column keeps a future change additive. */
    visibility: text("visibility").notNull().default("private"),
    pictureData: bytea("picture_data"),
    pictureMime: text("picture_mime"),
    pictureVersion: timestamp("picture_version", { withTimezone: true }).notNull().defaultNow(),
    /** Optional per-group override. The authoritative limit lives in lib/groups/limits.ts. */
    maxMembers: integer("max_members"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("groups_owner_idx").on(t.ownerId)],
);

export const groupMembers = pgTable(
  "group_members",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    /** Granted capabilities for role='admin'; always empty for owner/member.
     *  The database default is '{}'::text[] (see scripts/migrations/schema.mjs);
     *  writes always pass an explicit list. */
    adminPermissions: text("admin_permissions").array().notNull(),
    invitedBy: integer("invited_by").references(() => users.id, { onDelete: "set null" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("group_members_user_idx").on(t.userId, t.groupId),
    index("group_members_group_role_idx").on(t.groupId, t.role),
    uniqueIndex("group_members_group_user_idx").on(t.groupId, t.userId),
  ],
);

export const groupInvitations = pgTable(
  "group_invitations",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    inviteeId: integer("invitee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedBy: integer("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    status: text("status").notNull().default("proposed"),
    message: text("message").notNull().default(""),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    index("group_invitations_group_pending_idx").on(t.groupId, t.createdAt),
    index("group_invitations_invitee_pending_idx").on(t.inviteeId, t.createdAt),
    index("group_invitations_expiry_idx").on(t.expiresAt),
    uniqueIndex("group_invitations_open_idx")
      .on(t.groupId, t.inviteeId)
      .where(sql`status in ('proposed', 'invited')`),
  ],
);

/** Server-granted premium entitlements. No HTTP route may write this table. */
export const groupEntitlements = pgTable("group_entitlements", {
  groupId: integer("group_id")
    .primaryKey()
    .references(() => groups.id, { onDelete: "cascade" }),
  tier: text("tier").notNull().default("premium_test"),
  memberLimit: integer("member_limit").notNull(),
  grantedBy: integer("granted_by").references(() => users.id, { onDelete: "set null" }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});
