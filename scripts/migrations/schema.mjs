/**
 * VYRON migration SQL — plain strings, no drizzle-kit, no interactive prompt.
 *
 * Every statement in this file is ADDITIVE and IDEMPOTENT:
 *   - `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`
 *   - `CREATE INDEX IF NOT EXISTS` / `CREATE UNIQUE INDEX IF NOT EXISTS`
 *   - constraints are only added when `pg_constraint` says they are missing
 *   - triggers are dropped/recreated by name (a trigger holds no data)
 *
 * There is deliberately no DROP TABLE, DROP COLUMN, TRUNCATE, DELETE or
 * destructive UPDATE anywhere in here. Community data is never reshaped by a
 * deploy. New tables are always added after the columns they reference so the
 * file can be replayed against a database created by an older revision.
 */

/** The VYRON 2.0 baseline (users, rooms, forum, DMs, vault, moderation). */
export const CORE_SCHEMA_SQL = `
-- ============ tables ============
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  uid text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  avatar_color text NOT NULL DEFAULT '#ff6a00',
  xp integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  is_bot boolean NOT NULL DEFAULT false,
  founder boolean NOT NULL DEFAULT false,
  is_dev boolean NOT NULL DEFAULT false,
  avatar_data bytea,
  avatar_mime text,
  avatar_version timestamptz NOT NULL DEFAULT now(),
  strikes integer NOT NULL DEFAULT 0,
  last_strike_at timestamptz,
  muted_until timestamptz,
  banned boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id serial PRIMARY KEY,
  token text NOT NULL UNIQUE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS waitlist (
  id serial PRIMARY KEY,
  nickname text NOT NULL UNIQUE,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT '🔥',
  color text NOT NULL DEFAULT '#ff6a00',
  is_vault boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id serial PRIMARY KEY,
  room_id integer NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS topics (
  id serial PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  likes integer NOT NULL DEFAULT 0,
  reply_count integer NOT NULL DEFAULT 0,
  pinned boolean NOT NULL DEFAULT false,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS replies (
  id serial PRIMARY KEY,
  topic_id integer NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS topic_likes (
  id serial PRIMARY KEY,
  topic_id integer NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vault_access (
  id serial PRIMARY KEY,
  token text NOT NULL UNIQUE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS voice_notes (
  id serial PRIMARY KEY,
  room_id integer NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data bytea NOT NULL,
  mime text NOT NULL DEFAULT 'audio/webm',
  duration_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS friendships (
  id serial PRIMARY KEY,
  requester_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id)
);

CREATE TABLE IF NOT EXISTS blocks (
  id serial PRIMARY KEY,
  blocker_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id serial PRIMARY KEY,
  sender_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ reconcile hand-edited schema variants (rename, keep data) ============
DO $$
BEGIN
  -- direct_messages: some variants used receiver_id instead of recipient_id
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'direct_messages' AND column_name = 'receiver_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'direct_messages' AND column_name = 'recipient_id') THEN
    ALTER TABLE direct_messages RENAME COLUMN receiver_id TO recipient_id;
  END IF;
  -- friendships: some variants used user_id/friend_id
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'friendships' AND column_name = 'user_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'friendships' AND column_name = 'requester_id') THEN
    ALTER TABLE friendships RENAME COLUMN user_id TO requester_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'friendships' AND column_name = 'friend_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'friendships' AND column_name = 'addressee_id') THEN
    ALTER TABLE friendships RENAME COLUMN friend_id TO addressee_id;
  END IF;
END $$;

-- ============ drift-proof columns ============
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS founder boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_dev boolean NOT NULL DEFAULT false;
-- Profile pictures. These were only ever added by a hand-run SQL file,
-- which is why production served a 500 from /api/profile/avatar after the
-- November deploy. They are part of the normal build migration now.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data bytea;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_version timestamptz NOT NULL DEFAULT now();

-- Chat reactions/replies were created lazily by the first action request,
-- so the read path raced a missing table. Create them up front.
CREATE TABLE IF NOT EXISTS chat_message_reactions (
  id serial PRIMARY KEY,
  message_id integer NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id integer;
ALTER TABLE users ADD COLUMN IF NOT EXISTS strikes integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_strike_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS muted_until timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_vault boolean NOT NULL DEFAULT false;

-- ============ indexes ============
-- Case-insensitive exact lookups (login, profile URLs, duplicates) use
-- lower(username) = lower($1); keep them fast as the squad grows.
CREATE INDEX IF NOT EXISTS users_lower_username_idx ON users (lower(username));
CREATE INDEX IF NOT EXISTS waitlist_lower_nickname_idx ON waitlist (lower(nickname));
CREATE INDEX IF NOT EXISTS messages_room_id_idx ON messages (room_id, id);
CREATE INDEX IF NOT EXISTS chat_message_reactions_message_idx ON chat_message_reactions (message_id);
CREATE INDEX IF NOT EXISTS messages_reply_to_idx ON messages (reply_to_id);
CREATE INDEX IF NOT EXISTS messages_user_created_idx ON messages (user_id, created_at);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages (created_at);
CREATE INDEX IF NOT EXISTS topics_activity_idx ON topics (last_activity_at);
CREATE INDEX IF NOT EXISTS topics_category_idx ON topics (category);
CREATE INDEX IF NOT EXISTS replies_topic_idx ON replies (topic_id);
CREATE INDEX IF NOT EXISTS topic_likes_unique_idx ON topic_likes (topic_id, user_id);
CREATE INDEX IF NOT EXISTS voice_notes_room_created_idx ON voice_notes (room_id, created_at);
CREATE INDEX IF NOT EXISTS friendships_pair_idx ON friendships (requester_id, addressee_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id, status);
CREATE INDEX IF NOT EXISTS blocks_pair_idx ON blocks (blocker_id, blocked_id);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks (blocked_id);
CREATE INDEX IF NOT EXISTS dm_out_idx ON direct_messages (sender_id, recipient_id, id);
CREATE INDEX IF NOT EXISTS dm_in_idx ON direct_messages (recipient_id, sender_id, id);
CREATE INDEX IF NOT EXISTS dm_created_idx ON direct_messages (created_at);

-- ============ vault classification ============
-- Room names, descriptions, icons and colours are community data: they are
-- never rewritten or deleted by a deploy. The interface owns presentation
-- (see lib/rooms.ts), so legacy rows cannot leak old copy into the product.
UPDATE rooms SET is_vault = true WHERE slug IN ('vault', 'omega-vault');

-- Only create the default Vault if no vault-marked room exists.
-- (Never duplicates or renames a customized vault.)
INSERT INTO rooms (slug, name, description, is_vault)
SELECT 'vault', 'The Vault',
       'Members-only. Sealed by passcode, cleared every 14 minutes.',
       true
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE is_vault);
`;

/**
 * Private groups — Slice A.
 *
 * Design notes (why this shape survives later slices):
 *  - Every row that will ever belong to a group (members, invitations, and in
 *    Slice B/C: messages, events, announcements, audit entries) hangs off
 *    `groups.id` with `ON DELETE CASCADE`, so deleting a group is one statement
 *    and nothing private can outlive it.
 *  - `group_members.role` + `admin_permissions` carry authorization. Adding a
 *    new capability later is a new string in code, never a new column.
 *  - `group_invitations` keeps its rows after a decision (status + timestamps)
 *    so the history is auditable, while the partial unique index guarantees
 *    only ONE live invitation per (group, invitee).
 *  - `groups.max_members` is an optional per-group override; the authoritative
 *    limits live in code/entitlements (src/lib/groups/limits.ts). The database
 *    trigger below is a safety net, not the policy.
 *  - `visibility` is 'private' for every group today. The column exists so a
 *    future discoverable-group feature is additive, and so every query already
 *    has one place to filter on.
 */
export const GROUPS_SCHEMA_SQL = `
-- ============ groups ============
CREATE TABLE IF NOT EXISTS groups (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  owner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'private',
  picture_data bytea,
  picture_mime text,
  picture_version timestamptz NOT NULL DEFAULT now(),
  max_members integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT groups_visibility_check CHECK (visibility IN ('private'))
);

-- Drift-proof columns (a database created by an older CREATE TABLE above).
ALTER TABLE groups ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE groups ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';
ALTER TABLE groups ADD COLUMN IF NOT EXISTS picture_data bytea;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS picture_mime text;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS picture_version timestamptz NOT NULL DEFAULT now();
ALTER TABLE groups ADD COLUMN IF NOT EXISTS max_members integer;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE groups ADD CONSTRAINT groups_visibility_check CHECK (visibility IN ('private'));
EXCEPTION WHEN duplicate_object OR check_violation THEN NULL;
END $$;

-- ============ memberships ============
CREATE TABLE IF NOT EXISTS group_members (
  id serial PRIMARY KEY,
  group_id integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  admin_permissions text[] NOT NULL DEFAULT '{}',
  invited_by integer REFERENCES users(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_members_role_check CHECK (role IN ('owner', 'admin', 'member')),
  CONSTRAINT group_members_admin_perms_check CHECK (
    role = 'admin'
    OR admin_permissions = '{}'::text[]
  ),
  UNIQUE (group_id, user_id)
);

ALTER TABLE group_members ADD COLUMN IF NOT EXISTS admin_permissions text[] NOT NULL DEFAULT '{}';
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS invited_by integer REFERENCES users(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE group_members
    ADD CONSTRAINT group_members_role_check CHECK (role IN ('owner', 'admin', 'member'));
EXCEPTION WHEN duplicate_object OR check_violation THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE group_members
    ADD CONSTRAINT group_members_admin_perms_check
    CHECK (role = 'admin' OR admin_permissions = '{}'::text[]);
EXCEPTION WHEN duplicate_object OR check_violation THEN NULL;
END $$;

-- Only one open invitation per (group, invitee). Decided rows are history.
CREATE TABLE IF NOT EXISTS group_invitations (
  id serial PRIMARY KEY,
  group_id integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  invitee_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_by integer REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'proposed',
  message text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  decided_at timestamptz,
  CONSTRAINT group_invitations_status_check CHECK (
    status IN ('proposed', 'invited', 'accepted', 'rejected', 'revoked', 'expired', 'declined')
  )
);

ALTER TABLE group_invitations ADD COLUMN IF NOT EXISTS reviewed_by integer REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE group_invitations ADD COLUMN IF NOT EXISTS message text NOT NULL DEFAULT '';
ALTER TABLE group_invitations ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE group_invitations ADD COLUMN IF NOT EXISTS decided_at timestamptz;

DO $$ BEGIN
  ALTER TABLE group_invitations ADD CONSTRAINT group_invitations_status_check CHECK (
    status IN ('proposed', 'invited', 'accepted', 'rejected', 'revoked', 'expired', 'declined')
  );
EXCEPTION WHEN duplicate_object OR check_violation THEN NULL;
END $$;

-- ============ entitlements (architecture only — no payments anywhere) ============
-- Granted exclusively by a server-side operator (scripts/group-entitlement.mjs).
-- There is no public API that can write this table, and no client flag is ever
-- trusted. Absence of a row means "free tier".
CREATE TABLE IF NOT EXISTS group_entitlements (
  group_id integer PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'premium_test',
  member_limit integer NOT NULL,
  granted_by integer REFERENCES users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CONSTRAINT group_entitlements_tier_check CHECK (tier <> 'free'),
  CONSTRAINT group_entitlements_limit_check CHECK (member_limit > 0)
);

ALTER TABLE group_entitlements ADD COLUMN IF NOT EXISTS granted_by integer REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE group_entitlements ADD COLUMN IF NOT EXISTS expires_at timestamptz;

DO $$ BEGIN
  ALTER TABLE group_entitlements ADD CONSTRAINT group_entitlements_tier_check CHECK (tier <> 'free');
EXCEPTION WHEN duplicate_object OR check_violation THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE group_entitlements ADD CONSTRAINT group_entitlements_limit_check CHECK (member_limit > 0);
EXCEPTION WHEN duplicate_object OR check_violation THEN NULL;
END $$;

-- ============ indexes ============
CREATE INDEX IF NOT EXISTS groups_owner_idx ON groups (owner_id);
CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members (user_id, group_id);
CREATE INDEX IF NOT EXISTS group_members_group_role_idx ON group_members (group_id, role);
CREATE INDEX IF NOT EXISTS group_invitations_group_pending_idx
  ON group_invitations (group_id, created_at)
  WHERE status IN ('proposed', 'invited');
CREATE INDEX IF NOT EXISTS group_invitations_invitee_pending_idx
  ON group_invitations (invitee_id, created_at)
  WHERE status IN ('proposed', 'invited');
CREATE INDEX IF NOT EXISTS group_invitations_expiry_idx
  ON group_invitations (expires_at)
  WHERE status IN ('proposed', 'invited');

-- One live invitation per (group, invitee). Decided rows are history and do
-- not block a fresh proposal, so the index is partial.
CREATE UNIQUE INDEX IF NOT EXISTS group_invitations_open_idx
  ON group_invitations (group_id, invitee_id)
  WHERE status IN ('proposed', 'invited');

-- ============ invariants that cannot be expressed as a CHECK ============
-- 1. Exactly one owner membership row per group, and it is groups.owner_id.
--
-- Statement level on purpose: an ownership transfer changes groups.owner_id
-- and two membership roles. Validating the final state of the statement (not
-- each intermediate row) means a transfer can never be rejected halfway.
CREATE OR REPLACE FUNCTION group_members_enforce_owner() RETURNS trigger AS $$
DECLARE
  gid integer;
  expected integer;
  owners integer;
  bad integer;
  touched integer[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT coalesce(array_agg(DISTINCT group_id), '{}') INTO touched FROM group_members_new;
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT coalesce(array_agg(DISTINCT group_id), '{}') INTO touched FROM (
      SELECT group_id FROM group_members_old
      UNION SELECT group_id FROM group_members_new
    ) u;
  ELSE
    SELECT coalesce(array_agg(DISTINCT group_id), '{}') INTO touched FROM group_members_old;
  END IF;

  FOREACH gid IN ARRAY touched
  LOOP
    SELECT owner_id INTO expected FROM groups WHERE id = gid;
    IF expected IS NULL THEN
      -- The group itself is being deleted (CASCADE); memberships go with it.
      CONTINUE;
    END IF;

    SELECT count(*) INTO owners
      FROM group_members WHERE group_id = gid AND role = 'owner';
    IF owners <> 1 THEN
      RAISE EXCEPTION 'a group must have exactly one owner membership (found %)', owners
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO bad
      FROM group_members
      WHERE group_id = gid
        AND ((user_id = expected AND role <> 'owner')
          OR (user_id <> expected AND role = 'owner'));
    IF bad > 0 THEN
      RAISE EXCEPTION 'the owner role must belong to groups.owner_id'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS group_members_owner_guard ON group_members;
CREATE TRIGGER group_members_owner_guard
  AFTER INSERT ON group_members
  REFERENCING NEW TABLE AS group_members_new
  FOR EACH STATEMENT EXECUTE FUNCTION group_members_enforce_owner();

DROP TRIGGER IF EXISTS group_members_owner_update_guard ON group_members;
CREATE TRIGGER group_members_owner_update_guard
  AFTER UPDATE ON group_members
  REFERENCING OLD TABLE AS group_members_old NEW TABLE AS group_members_new
  FOR EACH STATEMENT EXECUTE FUNCTION group_members_enforce_owner();

DROP TRIGGER IF EXISTS group_members_owner_delete_guard ON group_members;
CREATE TRIGGER group_members_owner_delete_guard
  AFTER DELETE ON group_members
  REFERENCING OLD TABLE AS group_members_old
  FOR EACH STATEMENT EXECUTE FUNCTION group_members_enforce_owner();

-- 1b. Leaving is a DELETE in its own statement, so the owner's seat is
--     protected directly: transfer ownership or delete the group instead.
CREATE OR REPLACE FUNCTION group_members_block_owner_delete() RETURNS trigger AS $$
DECLARE
  expected integer;
BEGIN
  SELECT owner_id INTO expected FROM groups WHERE id = OLD.group_id;
  IF expected IS NOT NULL AND OLD.user_id = expected THEN
    RAISE EXCEPTION 'the group owner cannot leave or be removed (transfer ownership first)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS group_members_owner_leave_guard ON group_members;
CREATE TRIGGER group_members_owner_leave_guard
  BEFORE DELETE ON group_members
  FOR EACH ROW EXECUTE FUNCTION group_members_block_owner_delete();

-- 2. Capacity safety net. The application checks capacity inside the same
--    transaction that holds the group row lock (src/lib/groups/service.ts) and
--    owns the real limits; this trigger only stops a runaway write path from
--    ever exceeding the entitlement. groups.max_members, when set, wins.
CREATE OR REPLACE FUNCTION group_members_enforce_capacity() RETURNS trigger AS $$
DECLARE
  current_count integer;
  limit_value integer;
BEGIN
  SELECT COALESCE(g.max_members, e.member_limit, CASE WHEN e.tier IS NULL THEN 25 ELSE 100 END)
    INTO limit_value
  FROM groups g
  LEFT JOIN group_entitlements e ON e.group_id = g.id
  WHERE g.id = NEW.group_id;
  IF limit_value IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO current_count FROM group_members WHERE group_id = NEW.group_id;
  IF current_count > limit_value THEN
    RAISE EXCEPTION 'group is full (% member limit)', limit_value
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS group_members_capacity_guard ON group_members;
CREATE TRIGGER group_members_capacity_guard
  AFTER INSERT ON group_members
  FOR EACH ROW EXECUTE FUNCTION group_members_enforce_capacity();
`;

/** Everything `scripts/migrate.mjs` runs, in order. */
export const MIGRATION_SQL = [
  { name: "core", sql: CORE_SCHEMA_SQL },
  { name: "groups", sql: GROUPS_SCHEMA_SQL },
];
