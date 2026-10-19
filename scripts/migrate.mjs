/**
 * Crownember bulletproof build-time migration.
 *
 * Runs BEFORE every deploy (see DEPLOYMENT.md build command). It is fully
 * idempotent — safe to run a hundred times — and uses plain SQL instead of
 * drizzle-kit so it can NEVER get stuck on an interactive prompt in CI.
 *
 * It reconciles ANY schema drift on the production database:
 *   - creates every missing table
 *   - adds every missing column (e.g. after a rebrand/feature drop)
 *   - recreates missing indexes
 *   - marks the Vault room and creates it only when no Vault exists
 *
 * It never deletes rooms, rewrites room copy, or adjusts message timestamps:
 * community data is not reshaped by a deploy.
 */
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL is not set — cannot migrate.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

const SCHEMA_SQL = `
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

try {
  await client.connect();
  await client.query(SCHEMA_SQL);
  const counts = await client.query(`
    SELECT
      (SELECT count(*) FROM rooms) AS rooms,
      (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM messages) AS messages,
      (SELECT count(*) FROM topics) AS topics
  `);
  const c = counts.rows[0];
  console.log(
    `✅ migrate: schema reconciled · rooms=${c.rooms} users=${c.users} messages=${c.messages} topics=${c.topics}`,
  );
  await client.end();
  process.exit(0);
} catch (err) {
  console.error("❌ migrate failed:", err?.message ?? err);
  process.exit(1);
}
