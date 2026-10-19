/**
 * Security-sensitive unit tests — pure functions only, no database.
 * Run: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  hashPassword,
  verifyPassword,
  DUMMY_PASSWORD_HASH,
} from "../src/lib/password";
import { detectAbuse } from "../src/lib/moderation";
import { botTrap, containsInjection } from "../src/lib/antibot";
import { NICKNAME_RE, USERNAME_RE } from "../src/lib/lookup";
import { checkRateLimit } from "../src/lib/rate-limit";
import { getRank, RANKS } from "../src/lib/ranks";
import { roomDisplay } from "../src/lib/rooms";
import { avatarVersion, serializeUser } from "../src/lib/utils";

// ---------- password hashing ----------

test("password: correct password verifies, wrong password fails", () => {
  const stored = hashPassword("correct-horse-battery");
  assert.equal(verifyPassword("correct-horse-battery", stored), true);
  assert.equal(verifyPassword("correct-horse-batterz", stored), false);
  assert.equal(verifyPassword("", stored), false);
});

test("password: same password twice produces different salts/hashes", () => {
  const a = hashPassword("same-password-123");
  const b = hashPassword("same-password-123");
  assert.notEqual(a, b);
  assert.equal(verifyPassword("same-password-123", a), true);
  assert.equal(verifyPassword("same-password-123", b), true);
});

test("password: malformed stored values never verify", () => {
  assert.equal(verifyPassword("x", ""), false);
  assert.equal(verifyPassword("x", "no-colon"), false);
  assert.equal(verifyPassword("x", ":deadbeef"), false);
  assert.equal(verifyPassword("x", "deadbeef:"), false);
});

test("password: dummy hash exists and does not verify a common password", () => {
  assert.ok(DUMMY_PASSWORD_HASH.includes(":"));
  assert.equal(verifyPassword("password", DUMMY_PASSWORD_HASH), false);
  assert.equal(verifyPassword("", DUMMY_PASSWORD_HASH), false);
});

// ---------- abuse detection ----------

test("abuse: clean everyday language passes", () => {
  for (const clean of [
    "gg wp everyone!",
    "need 2 players for ranked push",
    "best drop in Bermuda this season?",
    "each utensil was clean", // "bc" trap between words
    "album cover looks great", // "bc" trap between words
    "the backend deploy worked",
  ]) {
    assert.equal(detectAbuse(clean), null, `should pass: ${clean}`);
  }
});

test("abuse: explicit insults are caught", () => {
  for (const bad of ["you fuck", "shit game", "what a bitch", "madarchod"]) {
    assert.notEqual(detectAbuse(bad), null, `should catch: ${bad}`);
  }
});

test("abuse: leet and punctuation obfuscation is caught", () => {
  for (const bad of ["ChUt1yE!", "b.c", "f.u.c.k", "bhosd1ke"]) {
    assert.notEqual(detectAbuse(bad), null, `should catch: ${bad}`);
  }
});

test("abuse: space-split abbreviations are caught", () => {
  for (const bad of ["m k c", "b k l"]) {
    assert.notEqual(detectAbuse(bad), null, `should catch: ${bad}`);
  }
});

// ---------- bot traps / injection ----------

test("antibot: honeypot catches filled hidden fields only", () => {
  assert.equal(botTrap({ website: "" }), false);
  assert.equal(botTrap({}), false);
  assert.equal(botTrap({ website: "https://spam.example" }), true);
  assert.equal(botTrap({ homepage: "buy now" }), true);
});

test("antibot: script/iframe injection attempts are caught", () => {
  assert.equal(containsInjection("hello world"), false);
  assert.equal(containsInjection("<script>alert(1)</script>"), true);
  assert.equal(containsInjection("<iframe src=x>"), true);
  assert.equal(containsInjection('click <img onerror=alert(1)>'), true);
  assert.equal(containsInjection("javascript:alert(1)"), true);
});

// ---------- identity patterns ----------

test("usernames: strict pattern with no wildcard surprises", () => {
  assert.equal(USERNAME_RE.test("BooyahKing"), true);
  assert.equal(USERNAME_RE.test("a_b"), true);
  assert.equal(USERNAME_RE.test("ab"), false); // too short
  assert.equal(USERNAME_RE.test("a".repeat(17)), false); // too long
  assert.equal(USERNAME_RE.test("a b"), false); // space
  assert.equal(USERNAME_RE.test("a%b"), false); // LIKE wildcard rejected
  assert.equal(NICKNAME_RE.test("a".repeat(21)), false);
});

// ---------- rate limiting ----------

test("rate-limit: allows N then blocks, and keys are independent", () => {
  const key = `test-${Math.random()}`;
  const other = `test-${Math.random()}`;
  for (let i = 0; i < 3; i++) {
    assert.equal(checkRateLimit(key, 3, 60_000).allowed, true);
  }
  const blocked = checkRateLimit(key, 3, 60_000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryInMs > 0);
  // a different key is unaffected
  assert.equal(checkRateLimit(other, 3, 60_000).allowed, true);
});


// ---------- product presentation rules ----------

test("ranks: tiers are ordered and every XP value maps to exactly one tier", () => {
  assert.equal(getRank(0).name, RANKS[0].name);
  assert.equal(getRank(250).name, RANKS[1].name);
  assert.equal(getRank(249).name, RANKS[0].name);
  const top = getRank(1_000_000);
  assert.equal(top.nextMinXp, null);
  assert.equal(top.progress, 1);
  for (const rank of RANKS) {
    const at = getRank(rank.minXp);
    assert.equal(at.name, rank.name, `boundary ${rank.minXp}`);
  }
});

test("rooms: legacy display copy is replaced and emoji never reaches the UI", () => {
  const legacy = roomDisplay({
    slug: "guides",
    name: "Community Guides",
    description: "Loadouts, sensitivity settings, booyah.",
    isVault: false,
  });
  assert.equal(legacy.name, "Community");
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(legacy.name));

  const custom = roomDisplay({
    slug: "design",
    name: "🎨 Design",
    description: "Critique and craft.",
    isVault: false,
  });
  assert.equal(custom.name, "Design");

  const vault = roomDisplay({
    slug: "omega-vault",
    name: "⚡ OMEGA VAULT [CLASSIFIED]",
    description: "x",
    isVault: true,
  });
  assert.equal(vault.name, "The Vault");
  assert.equal(vault.icon, "lock");
});

test("users: public serialization never exposes the legacy uid", () => {
  const row = {
    id: 7,
    username: "Annabelle",
    passwordHash: "secret",
    uid: "1662515387",
    bio: "",
    avatarColor: "#ff6a00",
    avatarMime: "image/png",
    avatarVersion: new Date(),
    xp: 300,
    likes: 2,
    isBot: false,
    founder: true,
    isDev: false,
    strikes: 0,
    lastStrikeAt: null,
    mutedUntil: null,
    banned: false,
    lastSeenAt: new Date(),
    createdAt: new Date(),
  };
  const serialized = serializeUser(row);
  assert.equal("uid" in serialized, false);
  assert.equal(serialized.username, "Annabelle");
  assert.equal(serialized.rank.name, getRank(300).name);
  assert.equal(serialized.dev, false);
  assert.equal(serialized.hasAvatar, true);
});

test("avatar: cache version is a stable seconds value with a fallback", () => {
  const stamp = new Date("2026-10-19T10:00:00Z");
  assert.equal(avatarVersion(stamp), String(Math.floor(stamp.getTime() / 1000)));
  assert.equal(avatarVersion(stamp), avatarVersion(stamp.toISOString()));
  assert.equal(avatarVersion(null), "0");
  assert.equal(avatarVersion(undefined), "0");
});
