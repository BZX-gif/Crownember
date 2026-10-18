/**
 * Migration safety tests — run the EXACT production migration SQL
 * (scripts/migration-sql.mjs) against disposable in-process PostgreSQL
 * (PGlite, WASM). No external database, no cost.
 *
 * What is verified:
 *  1. A legacy "Crownember" database (old columns, plain like index,
 *     duplicate likes, FF-era room content, 10-seat cap, receiver_id
 *     drift) is reconciled correctly and losslessly.
 *  2. Like integrity: duplicates are removed, the new UNIQUE index then
 *     REJECTS a second like, and counters re-sync to the real rows.
 *  3. The notifications inbox table and its indexes are created.
 *  4. The one-time cap lift fires ONLY on the legacy default ('10') and
 *     never touches a deliberate owner-set cap.
 *  5. Room rebrand is cosmetic (slugs/links preserved) and the Vault is
 *     created exactly once.
 *  6. The whole migration is idempotent (safe to run twice).
 *  7. A completely empty database migrates cleanly from zero.
 *
 * Run: node --test tests/migration.test.mjs   (or npm test)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { SCHEMA_SQL, REFRESH_SQL } from "../scripts/migration-sql.mjs";

/** The pre-VYRON production shape (drifted on purpose in the fields the
 *  migration is designed to heal). */
const LEGACY_SQL = `
CREATE TABLE users (
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
CREATE TABLE settings (key text PRIMARY KEY, value text NOT NULL);
CREATE TABLE rooms (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT '🔥',
  color text NOT NULL DEFAULT '#ff6a00',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE messages (
  id serial PRIMARY KEY,
  room_id integer NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE topics (
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
CREATE TABLE replies (
  id serial PRIMARY KEY,
  topic_id integer NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE topic_likes (
  id serial PRIMARY KEY,
  topic_id integer NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- the historical bug: a PLAIN index guarding against duplicates
CREATE INDEX topic_likes_unique_idx ON topic_likes (topic_id, user_id);

-- schema drift the migration must heal
CREATE TABLE direct_messages (
  id serial PRIMARY KEY,
  sender_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO users (id, username, password_hash, likes) VALUES
  (1, 'author', 'x', 999),
  (2, 'alice', 'x', 0),
  (3, 'bob', 'x', 0);
SELECT setval('users_id_seq', 10);

INSERT INTO settings (key, value) VALUES ('max_players', '10');

INSERT INTO rooms (slug, name, description, icon, color) VALUES
  ('global', 'Global Chat', 'The main hangout for every Free Fire player.', '🔥', '#ff6a00'),
  ('tips', 'Tips & Strategies', 'Old room about to be renamed.', '📖', '#38bdf8'),
  ('vault', 'The Vault', 'old', '🔐', '#f59e0b');

INSERT INTO topics (id, title, content, user_id, likes, reply_count) VALUES
  (1, 'Hello world', 'first post', 1, 7, 5),
  (2, 'Second post', 'body', 1, 0, 0);
SELECT setval('topics_id_seq', 10);

INSERT INTO replies (topic_id, user_id, content) VALUES
  (1, 2, 'nice'),
  (1, 3, 'agreed');

INSERT INTO topic_likes (topic_id, user_id) VALUES
  (1, 2), (1, 2), (1, 3),
  (2, 3);

INSERT INTO direct_messages (sender_id, receiver_id, content) VALUES
  (2, 1, 'old dm column survives');
`;

async function freshDb() {
  const db = new PGlite();
  return db;
}

async function migrate(db) {
  await db.exec(SCHEMA_SQL);
  await db.exec(REFRESH_SQL);
}

test("legacy database reconciles losslessly", async () => {
  const db = await freshDb();
  await db.exec(LEGACY_SQL);
  await migrate(db);

  // every pre-existing record survives
  const { rows: [{ n: userCount }] } = await db.query("SELECT count(*)::int AS n FROM users");
  assert.equal(userCount, 3);
  const { rows: [{ n: dmCount }] } = await db.query("SELECT count(*)::int AS n FROM direct_messages");
  assert.equal(dmCount, 1);

  // drift healed: receiver_id renamed to recipient_id, data intact
  const { rows: cols } = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'direct_messages'",
  );
  const names = cols.map((c) => c.column_name);
  assert.ok(names.includes("recipient_id"), "recipient_id exists");
  assert.ok(!names.includes("receiver_id"), "receiver_id gone");
  const { rows: [dm] } = await db.query("SELECT recipient_id FROM direct_messages LIMIT 1");
  assert.equal(dm.recipient_id, 1);

  // missing column added
  assert.ok(
    (await db.query(
      "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_dev'",
    )).rows[0].n === 1,
  );

  // duplicate likes deduped (kept exactly one per topic+user)
  const { rows: likeRows } = await db.query(
    "SELECT topic_id, user_id, count(*)::int AS n FROM topic_likes GROUP BY 1,2 ORDER BY 1,2",
  );
  assert.deepEqual(
    likeRows.map((r) => `${r.topic_id}:${r.user_id}:${r.n}`),
    ["1:2:1", "1:3:1", "2:3:1"],
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM topic_likes")).rows[0].n,
    3,
  );

  // counters re-synced to the real rows
  assert.equal(
    (await db.query("SELECT likes FROM topics WHERE id = 1")).rows[0].likes,
    2,
  );
  assert.equal(
    (await db.query("SELECT likes FROM topics WHERE id = 2")).rows[0].likes,
    1,
  );
  assert.equal(
    (await db.query("SELECT reply_count FROM topics WHERE id = 1")).rows[0].reply_count,
    2,
  );
  assert.equal(
    (await db.query("SELECT likes FROM users WHERE id = 1")).rows[0].likes,
    3, // 2 likes on topic 1 + 1 on topic 2 — the old stale 999 is corrected
  );

  // unique index now enforces one-like-per-user-per-topic
  await assert.rejects(
    db.query("INSERT INTO topic_likes (topic_id, user_id) VALUES (1, 2)"),
    /duplicate key|unique/i,
  );
  await db.query(
    "INSERT INTO topic_likes (topic_id, user_id) VALUES (1, 2) ON CONFLICT DO NOTHING",
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM topic_likes")).rows[0].n,
    3,
    "ON CONFLICT DO NOTHING leaves the count untouched",
  );
  // …but a new user can still like (index is not over-eager)
  await db.query("INSERT INTO topic_likes (topic_id, user_id) VALUES (1, 1)");
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM topic_likes")).rows[0].n,
    4,
  );

  // notifications infrastructure exists
  assert.ok(
    (await db.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'notifications'",
    )).rows[0].n === 1,
  );
  const { rows: idx } = await db.query(
    "SELECT indexname FROM pg_indexes WHERE tablename = 'notifications'",
  );
  const idxNames = idx.map((i) => i.indexname);
  assert.ok(idxNames.includes("notifications_user_unread_idx"));
  assert.ok(idxNames.includes("notifications_user_created_idx"));
  assert.ok(idxNames.includes("notifications_like_unique_idx"));

  // the partial unique index enforces like-notification dedupe
  await db.query(
    "INSERT INTO notifications (user_id, actor_id, type, topic_id) VALUES (1, 2, 'like', 1)",
  );
  await assert.rejects(
    db.query(
      "INSERT INTO notifications (user_id, actor_id, type, topic_id) VALUES (1, 2, 'like', 1)",
    ),
    /duplicate key|unique/i,
  );
  // …while a reply notification for the same actor/topic is allowed twice
  await db.query(
    "INSERT INTO notifications (user_id, actor_id, type, topic_id) VALUES (1, 2, 'reply', 1)",
  );
  await db.query(
    "INSERT INTO notifications (user_id, actor_id, type, topic_id) VALUES (1, 2, 'reply', 1)",
  );
  assert.equal(
    (await db.query(
      "SELECT count(*)::int AS n FROM notifications WHERE type = 'reply'",
    )).rows[0].n,
    2,
  );

  // legacy 10-seat cap lifted
  assert.equal(
    (await db.query("SELECT value FROM settings WHERE key = 'max_players'")).rows[0].value,
    "10000000",
  );

  // room rebrand: cosmetic only, slugs preserved
  const { rows: roomRows } = await db.query(
    "SELECT slug, name, color, is_vault FROM rooms ORDER BY id",
  );
  assert.deepEqual(
    roomRows.map((r) => `${r.slug}|${r.name}|${r.color}|${r.is_vault}`),
    [
      "global|Global|#e5e5e5|false",
      "guides|The Lounge|#e5e5e5|false", // old 'tips' slug renamed in place
      "vault|The Vault|#e5e5e5|true",
    ],
  );

  await db.close();
});

test("deliberate owner-set cap is never touched", async () => {
  const db = await freshDb();
  await db.exec(LEGACY_SQL);
  await db.exec("UPDATE settings SET value = '25' WHERE key = 'max_players'");
  await migrate(db);
  assert.equal(
    (await db.query("SELECT value FROM settings WHERE key = 'max_players'")).rows[0].value,
    "25",
  );
  await db.close();
});

test("migration is idempotent", async () => {
  const db = await freshDb();
  await db.exec(LEGACY_SQL);
  await migrate(db);
  await migrate(db); // second full run must not fail or double anything
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM topic_likes")).rows[0].n,
    3,
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM rooms WHERE is_vault")).rows[0].n,
    1,
    "exactly one vault",
  );
  await db.close();
});

test("empty database migrates cleanly from zero", async () => {
  const db = await freshDb();
  await migrate(db);
  const { rows: [{ n: roomCount }] } = await db.query("SELECT count(*)::int AS n FROM rooms");
  assert.equal(roomCount, 1, "the default Vault room is created");
  assert.ok(
    (await db.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('notifications','topic_likes','users','topics')",
    )).rows[0].n === 4,
  );
  await db.close();
});

test("stale demo messages are refreshed once, fresh ones untouched", async () => {
  const db = await freshDb();
  await db.exec(LEGACY_SQL);
  await db.exec(`
    INSERT INTO messages (room_id, user_id, content, created_at) VALUES
      (1, 1, 'old', now() - interval '5 hours');
  `);
  await migrate(db);
  const fresh1 = await db.query(
    "SELECT count(*)::int AS n FROM messages WHERE created_at >= now() - interval '3 hours'",
  );
  assert.equal(fresh1.rows[0].n, 1, "the stale message was refreshed");
  const { rows: [before] } = await db.query("SELECT created_at FROM messages");
  await migrate(db); // fresh messages exist now — refresh must stay silent
  const { rows: [after] } = await db.query("SELECT created_at FROM messages");
  assert.equal(after.created_at.getTime(), before.created_at.getTime());
  await db.close();
});
