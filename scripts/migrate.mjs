import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("❌ DATABASE_URL is not set — cannot migrate."); process.exit(1); }
const client = new pg.Client({ connectionString: url });

const SCHEMA_SQL = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data bytea;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_version timestamptz NOT NULL DEFAULT now();
`;

try {
  await client.connect();
  await client.query(SCHEMA_SQL);
  console.log("✅ migrate: avatar columns reconciled");
  await client.end();
  process.exit(0);
} catch (err) {
  console.error("❌ migrate failed:", err?.message ?? err);
  process.exit(1);
}
