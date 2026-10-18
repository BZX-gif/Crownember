// Runs before test modules load (via `node --import`). Lets modules that
// import the db layer (e.g. moderation.ts) load in unit tests without a real
// database — no connection is ever opened by these pure-function tests.
process.env.DATABASE_URL ??=
  "postgresql://test:test@localhost:5432/crownember_test";
