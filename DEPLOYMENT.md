# 🚀 Take VYRON Live — 100% Free (₹0 / $0)

Your site already works. To let **real people** connect with each other from
their phones, you just need to put it on the internet. Everything below is a
**free tier** — no credit card anywhere.

- **Hosting:** Vercel free tier → https://vercel.com
- **Database:** Neon free PostgreSQL → https://neon.tech (or Supabase free → https://supabase.com)
- **Code storage:** GitHub free → https://github.com

> Why this works with zero money: chat uses visibility-aware polling (every 6 seconds),
> so it runs perfectly on free serverless hosting — no paid WebSocket servers
> needed. Messages are stored in the database so **every member sees the same
> room on any device** — for the life of the message: 3 hours in public
> rooms, 14 minutes in the Vault.

---

## Step 1 — Put your code on GitHub (free)

1. Create a free account on https://github.com
2. Click **New repository** → name it `vyron` → keep it **Private** if you want
3. Upload this project's files (or `git init`, `git add .`, `git commit`, `git push`)

## Step 2 — Create the free database (5 minutes)

1. Go to https://neon.tech → sign up (free, no card)
2. Click **Create project** → pick the region closest to your users
3. When it finishes, copy the **connection string**. It looks like:
   `postgresql://neondb_owner:XXXX@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require`
4. ⚠️ Use the **pooled** connection string (it has `-pooler` in the hostname) —
   free serverless hosting needs pooling.

## Step 3 — Deploy on Vercel (5 minutes)

1. Go to https://vercel.com → sign up **with your GitHub account**
2. Click **Add New → Project** → import your `vyron` repo
3. Before clicking Deploy, open **Environment Variables** and add:
   - Key: `DATABASE_URL`
   - Value: the Neon **pooled** connection string from Step 2
4. Open **Build & Development Settings** and set the **Build Command** to:
   ```
   node scripts/migrate.mjs && npx tsx src/db/seed.ts && next build
   ```
   - `scripts/migrate.mjs` is a prompt-free migration: it creates every
     missing table/column/index (including profile-picture storage and chat
     reactions), marks the Vault room, and is 100% idempotent — safe on every
     single deploy. It never deletes rooms or rewrites community content.
   - `seed.ts` fills the community on a brand-new database and safely skips
     itself afterwards.
   - **Use this command even if you previously used `drizzle-kit push`** —
     it fixes any schema drift automatically.
5. Click **Deploy**. In ~2 minutes you get a live link like
   `https://vyron.vercel.app` — **that's your real website. Free forever.**

## Step 4 — Test it like a real user

1. Open your link on your phone **and** your laptop (or send it to a friend)
2. Register on both devices → chat in **Global Chat**
3. You'll see each other's messages appear within a few seconds (rooms
   refresh every 6 seconds while the tab is visible). That's it — you're live.

## Step 5 — Free custom touches (optional)

- **Custom name:** On Vercel, Settings → Domains → claim
  `vyron.vercel.app` style subdomain (free). A real `.com` costs ~$10/year
  *only when you want it* — skip it until you're earning.
- **Analytics:** Vercel → Analytics tab → enable (free) to watch visitor
  counts go up. 📈
- **When you outgrow in-memory rate limits:** add Upstash Redis free tier
  (10k requests/day free) — only when you have thousands of users.

---

## 🎛️ Controls you have as the owner

### 🔐 The Vault key

Open `/chat/vault` as your founder account. If the Vault has no key yet,
you'll see **"Forge the key"** — set the passcode there. Founders can rotate
the key anytime from inside the Vault (🗝️ vault key button). The passcode is
stored only as a salted scrypt hash — it never touches any browser, and
unlock attempts are rate-limited (5 per 15 minutes).

> ⚠️ **Rotate immediately if your database is old.** Earlier builds shipped a
> default Vault key that is now public in the repo's history. If your Vault
> still opens with it, rotate the key from inside the Vault — rotation
> instantly revokes every unlocked session, so only people with the NEW key
> get back in.

Run these in the **Neon SQL editor** (Console → SQL) any time:

```sql
-- Open more seats when the hype demands it (10 → 50)
update settings set value = '50' where key = 'max_players';

-- See everyone waiting in line
select id, nickname, note, created_at from waitlist order by id;

-- See your founding members
select id, username, uid, xp from users where founder = true order by id;

-- Promote a waitlist user: raise the cap, then tell them to register.
```

### 🔑 Account recovery (password forgotten)

There is deliberately **no self-serve "forgot password"** — with no email
service budget, that would be an insecure guess. As the owner, you can reset
any user's password from your machine:

```
NEW_PASSWORD='a-strong-new-password' npx tsx scripts/reset-password.ts <username>
```

It writes only a scrypt hash, never prints the password, and logs that
account out of every device. (Future upgrade when there's budget: a real
email-based reset.)

### 👥 Private groups: premium capacity (Slice A)

Groups are private, invitation-plus-approval, and capped at **25 active
members including the owner**. Raising one group to the premium test tier
(**100 members**) is an operator action — there is deliberately **no endpoint
that can grant premium**, so nobody can buy, forge or self-assign it:

```
npx tsx scripts/group-entitlement.ts list
npx tsx scripts/group-entitlement.ts grant  <groupId> [memberLimit]
npx tsx scripts/group-entitlement.ts revoke <groupId>
```

A downgrade never removes existing members; the limit only applies to new
joins. Full design, permission matrix and privacy contract:
[`docs/GROUPS.md`](docs/GROUPS.md).

The migration log line now reads
`✅ migrate: schema reconciled · rooms=3 users=8 messages=0 topics=0 groups=0 group_members=0`.
Review the SQL it would run without contacting any database:
`node scripts/migrate.mjs --dry-run`.

`src/app/loading.tsx` was removed on purpose: a root loading boundary makes
Next stream the shell before the page runs, which turned every `notFound()` in
the app (including private group ids) into an HTTP **200**. Details and the
measured table: [`docs/GROUPS.md`](docs/GROUPS.md).

If profile pictures were uploaded before the content-sniffing fix, reclassify
the stored mime labels (report first, then apply):

```
npx tsx scripts/fix-avatar-mimes.ts
npx tsx scripts/fix-avatar-mimes.ts --apply
```

### 🧪 Tests

```
npm test          # unit tests — no database, no credentials
npm run test:db   # group integration tests — needs VYRON_TEST_DATABASE_URL
```

`VYRON_TEST_DATABASE_URL` must point at a **disposable** database; the suite
creates its own tables and users and drops them afterwards. Without it the
integration suite skips itself, so CI never needs production credentials.

## 🛡️ What's already protected

- **Server-side truth:** XP, ranks, seats and messages are only ever changed
  by the server. Editing the page in a browser changes nothing for anyone.
- **Server-side truth first:** every action is authorized on the server; the
  client is never trusted. (The old right-click/F12 "lockdown" was removed — it
  only annoyed real users and blocked phone keyboards.)
- **Rate limits:** chat (8 msg/10s + 1.5s cooldown), signups (5/hour),
  login (10/15min per IP **and** per account), Vault unlock (5/15min),
  likes (30/min), replies (10/min), topics (5/hour).
- **Bot traps:** hidden honeypot fields on every form + script-injection
  filters on all content.
- **Security headers:** CSP, clickjacking protection (frame-ancestors DENY),
  nosniff, permissions locked down.
- **Passwords:** hashed with scrypt — never stored in plain text. New
  accounts need 8+ characters; login costs the same time for unknown
  accounts (no username probing through timing).
- **Sessions & Vault tokens:** httpOnly cookies (Secure in production),
  server-side expiry, and Vault tokens die instantly when the key rotates.
- **Bot accounts** (demo chat population) can never log in.
- **Uploads are sniffed, not trusted:** profile and group pictures are
  validated by file signature (PNG/JPEG/WebP), the stored and served
  `Content-Type` comes from the bytes rather than the browser's claim, and the
  size cap is checked before the bytes are read. A renamed HTML file is
  rejected, and a legacy row that is not really an image is served as a 404
  instead of as markup.
- **Private groups are private:** one server-side guard
  (`requireGroup()`) answers every group route and page; a non-member and a
  guessed id get the same 404, group pages are `noindex` with a generic title,
  and group mutations additionally require a same-origin request.
- **Capacity is race-safe:** the member limit is enforced inside a transaction
  holding a row lock (`SELECT … FOR UPDATE`), with a database trigger and a
  partial unique index as the last line of defence.

## 🚑 Troubleshooting

**"This page couldn't load — a server error occurred"**
Almost always means the database schema is behind the code (missing columns
or tables on Neon). Fix:
1. Vercel → your project → **Settings → Build & Development Settings** →
   confirm the Build Command is exactly:
   `node scripts/migrate.mjs && npx tsx src/db/seed.ts && next build`
2. Go to the **Deployments** tab → latest deployment → **⋯ → Redeploy**
   (uncheck "Use existing Build Cache").
3. Open the build log — you should see a line like
   `✅ migrate: schema reconciled · rooms=3 users=8 ...`
   The migration heals any drift automatically; no manual SQL needed.

**Build fails at migrate**
- Check that the `DATABASE_URL` environment variable is set to Neon's
  **pooled** connection string (Vercel → Settings → Environment Variables,
  available in **Build** ✓).

**Chat rooms look empty after a deploy**
Expected. Public messages clear three hours after they are sent and the Vault
clears after fourteen minutes. Nothing is re-dated or replayed by a deploy;
an empty room means nobody has spoken recently.

## 📣 Getting your first users (also free)

1. Share your link in relevant communities + social media
2. Post a short video: *"I built a premium social platform with only 10 founding seats"* — scarcity gets clicks
3. Drop the link in relevant Discord servers with: *"First 10 members get the FOUNDER badge forever"*
4. Watch the waitlist number grow. That number IS your marketing. ✨