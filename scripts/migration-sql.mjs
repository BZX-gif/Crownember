/**
 * VYRON migration SQL — single source of truth.
 *
 * Runs BEFORE every deploy (see DEPLOYMENT.md build command). It is fully
 * idempotent — safe to run a hundred times — and uses plain SQL instead of
 * drizzle-kit so it can NEVER get stuck on an interactive prompt in CI.
 *
 * It reconciles ANY schema drift on the production database:
 *   - creates every missing table (including the notifications inbox)
 *   - adds every missing column (e.g. after a rebrand/feature drop)
 *   - recreates missing indexes
 *   - enforces one-like-per-member-per-topic (dedupes history first)
 *   - re-syncs denormalized counters (topic likes / reply counts) to the
 *     actual rows, so displayed counts always reflect underlying data
 *   - reshapes rooms to the live 3-room layout (Global / Lounge / Vault)
 *   - VYRON rebrand, one-time: lifts the legacy 10-seat launch cap so the
 *     platform is open (only fires when the stored cap is exactly the
 *     original launch default; the owner can set any cap via SQL later)
 *   - one-time: refreshes ancient seeded chat timestamps so rooms don't
 *     open empty right after a deploy (only fires when every message is
 *     older than the 3h self-destruct window)
 */
/**
 * The SQL lives here (string literals only, zero dependencies) so BOTH the
 * production migration runner (scripts/migrate.mjs, node-postgres over TCP)
 * AND the disposable-database migration test (tests/migration.test.mjs,
 * in-process PGlite) execute byte-identical statements.
 */

export const SCHEMA_SQL = `
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

CREATE TABLE IF NOT EXISTS notifications (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  topic_id integer REFERENCES topics(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  read_at timestamptz,
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
CREATE INDEX IF NOT EXISTS messages_user_created_idx ON messages (user_id, created_at);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages (created_at);
CREATE INDEX IF NOT EXISTS topics_activity_idx ON topics (last_activity_at);
CREATE INDEX IF NOT EXISTS topics_category_idx ON topics (category);
CREATE INDEX IF NOT EXISTS replies_topic_idx ON replies (topic_id);
CREATE INDEX IF NOT EXISTS voice_notes_room_created_idx ON voice_notes (room_id, created_at);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications (user_id, id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at);
CREATE INDEX IF NOT EXISTS friendships_pair_idx ON friendships (requester_id, addressee_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id, status);
CREATE INDEX IF NOT EXISTS blocks_pair_idx ON blocks (blocker_id, blocked_id);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks (blocked_id);
CREATE INDEX IF NOT EXISTS dm_out_idx ON direct_messages (sender_id, recipient_id, id);
CREATE INDEX IF NOT EXISTS dm_in_idx ON direct_messages (recipient_id, sender_id, id);
CREATE INDEX IF NOT EXISTS dm_created_idx ON direct_messages (created_at);

-- ============ like integrity ============
-- History lesson: topic_likes_unique_idx used to be a PLAIN index, so two
-- concurrent toggles could insert duplicate likes and the counts would lie.
-- 1) dedupe any historical doubles (keep the oldest row), 2) recreate the
-- index as UNIQUE, 3) re-sync every denormalized counter to the real rows.
-- All three steps are idempotent.
DELETE FROM topic_likes a USING topic_likes b
WHERE a.topic_id = b.topic_id AND a.user_id = b.user_id AND a.id > b.id;
DROP INDEX IF EXISTS topic_likes_unique_idx;
CREATE UNIQUE INDEX topic_likes_unique_idx ON topic_likes (topic_id, user_id);

-- One like-notification per (recipient, actor, topic): re-liking after an
-- unlike refreshes the moment instead of spamming a second notification,
-- and a retried request can never create a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_like_unique_idx
  ON notifications (user_id, actor_id, topic_id) WHERE type = 'like';

UPDATE topics t SET likes = (SELECT count(*) FROM topic_likes l WHERE l.topic_id = t.id);
UPDATE topics t SET reply_count = (SELECT count(*) FROM replies r WHERE r.topic_id = t.id);
UPDATE users u SET likes = (
  SELECT count(*) FROM topic_likes l JOIN topics t ON l.topic_id = t.id
  WHERE t.user_id = u.id
);

-- ============ VYRON: open the platform (one-time, targeted) ============
-- Crownember launched with a 10-seat Founding Squad cap; VYRON is a global
-- social platform. Lift ONLY the legacy launch default so a deliberate
-- owner-set cap (any other value) is never touched. Reversible anytime:
--   update settings set value = '50' where key = 'max_players';
UPDATE settings SET value = '10000000' WHERE key = 'max_players' AND value = '10';

-- ============ live room layout (Global / Lounge / Vault) ============
-- Legacy cleanup only: renames/deletes from the original 6-room layout.
UPDATE rooms SET
  slug = 'guides',
  name = 'The Lounge',
  icon = '☕',
  color = '#e5e5e5',
  description = 'Slow conversation. Ideas, introductions and everything that does not fit the noise.'
WHERE slug = 'tips';

DELETE FROM rooms WHERE slug IN ('squads', 'tournaments', 'memes', 'news');

-- Mark whichever room IS the vault first (any name: vault, omega-vault, ...)
-- so the cosmetic refresh below can match on is_vault reliably.
UPDATE rooms SET is_vault = true WHERE slug IN ('vault', 'omega-vault');

-- VYRON rebrand: cosmetic display refresh only — slugs (and every existing
-- link) are preserved. Monochrome accents; meaning comes from icons.
UPDATE rooms SET
  name = 'Global',
  description = 'The main room — every member, one conversation. Messages fade after three hours.',
  icon = '🌐',
  color = '#e5e5e5'
WHERE slug = 'global';
UPDATE rooms SET
  name = 'The Lounge',
  description = 'Slow conversation. Ideas, introductions and everything that does not fit the noise.',
  icon = '☕',
  color = '#e5e5e5'
WHERE slug = 'guides';
UPDATE rooms SET
  description = 'Passcode-sealed inner circle. Voice notes burn the moment anyone leaves.',
  color = '#e5e5e5'
WHERE is_vault;

-- Only create the default Vault if no vault-marked room exists.
-- (Never duplicates or renames a customized vault.)
INSERT INTO rooms (slug, name, description, icon, color, is_vault)
SELECT 'vault', 'The Vault',
       'Passcode-sealed inner circle. Voice notes burn the moment anyone leaves.',
       '🔐', '#e5e5e5', true
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE is_vault);
`;

/** One-time demo refresh: if EVERY chat message is older than the 3h
 *  self-destruct window, redistribute them across the last ~45 minutes so
 *  rooms don't open empty right after a deploy. Skips itself once any
 *  fresh message exists. */
export const REFRESH_SQL = `
WITH stale AS (
  SELECT count(*) AS old_count FROM messages WHERE created_at < now() - interval '3 hours'
), fresh AS (
  SELECT count(*) AS new_count FROM messages WHERE created_at >= now() - interval '3 hours'
)
UPDATE messages m SET created_at = now() - make_interval(mins => (5 + r.rn * 4)::int)
FROM (
  SELECT id, row_number() OVER (PARTITION BY room_id ORDER BY id DESC) AS rn
  FROM messages
) r, stale, fresh
WHERE m.id = r.id
  AND stale.old_count > 0
  AND fresh.new_count = 0;
`;
