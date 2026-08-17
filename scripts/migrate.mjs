/**
 * EMBERCROWN bulletproof build-time migration.
 *
 * Runs BEFORE every deploy (see DEPLOYMENT.md build command). It is fully
 * idempotent — safe to run a hundred times — and uses plain SQL instead of
 * drizzle-kit so it can NEVER get stuck on an interactive prompt in CI.
 *
 * It reconciles ANY schema drift on the production database:
 *   - creates every missing table
 *   - adds every missing column (e.g. after a rebrand/feature drop)
 *   - recreates missing indexes
 *   - reshapes rooms to the live 3-room layout (Global / Guides / Vault)
 *   - one-time: refreshes ancient seeded chat timestamps so rooms don't
 *     open empty right after a deploy (only fires when every message is
 *     older than the 3h self-destruct window)
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
CREATE INDEX IF NOT EXISTS messages_room_id_idx ON messages (room_id, id);
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

-- ============ live room layout (Global / Guides / Vault) ============
-- Legacy cleanup only: renames/deletes from the original 6-room layout.
UPDATE rooms SET
  slug = 'guides',
  name = 'Community Guides',
  icon = '📖',
  color = '#38bdf8',
  description = 'Loadouts, sensitivity settings, drop spots and pro wisdom. Read, learn, booyah.'
WHERE slug = 'tips';

DELETE FROM rooms WHERE slug IN ('squads', 'tournaments', 'memes', 'news');

-- Mark whichever room IS the vault (any name: vault, omega-vault, ...).
UPDATE rooms SET is_vault = true WHERE slug IN ('vault', 'omega-vault');

-- Only create the default Vault if no vault-marked room exists.
-- (Never duplicates or renames a customized vault.)
INSERT INTO rooms (slug, name, description, icon, color, is_vault)
SELECT 'vault', 'The Vault',
       'Password-sealed inner circle. Voice notes burn the moment anyone leaves.',
       '🔐', '#f59e0b', true
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE is_vault);
`;

/** One-time demo refresh: if EVERY chat message is older than the 3h
 *  self-destruct window, redistribute them across the last ~45 minutes so
 *  rooms don't open empty right after a deploy. Skips itself once any
 *  fresh message exists. */
const REFRESH_SQL = `
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

try {
  await client.connect();
  await client.query(SCHEMA_SQL);
  const refreshed = await client.query(REFRESH_SQL);
  const counts = await client.query(`
    SELECT
      (SELECT count(*) FROM rooms) AS rooms,
      (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM messages) AS messages,
      (SELECT count(*) FROM topics) AS topics
  `);
  const c = counts.rows[0];
  console.log(
    `✅ migrate: schema reconciled · rooms=${c.rooms} users=${c.users} messages=${c.messages} topics=${c.topics}` +
      (refreshed.rowCount > 0 ? ` · refreshed ${refreshed.rowCount} stale messages` : ""),
  );
  await client.end();
  process.exit(0);
} catch (err) {
  console.error("❌ migrate failed:", err?.message ?? err);
  process.exit(1);
}
