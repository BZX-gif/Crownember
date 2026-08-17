# 🚀 Take EMBERCROWN Live — 100% Free (₹0 / $0)

Your site already works. To let **real players** chat with each other from
their phones, you just need to put it on the internet. Everything below is a
**free tier** — no credit card anywhere.

- **Hosting:** Vercel free tier → https://vercel.com
- **Database:** Neon free PostgreSQL → https://neon.tech (or Supabase free → https://supabase.com)
- **Code storage:** GitHub free → https://github.com

> Why this works with zero money: chat uses smart polling (every 3 seconds),
> so it runs perfectly on free serverless hosting — no paid WebSocket servers
> needed. Messages are saved in the database, so **every player sees every
> message from everyone, on any device, forever.**

---

## Step 1 — Put your code on GitHub (free)

1. Create a free account on https://github.com
2. Click **New repository** → name it `ffzone` → keep it **Private** if you want
3. Upload this project's files (or `git init`, `git add .`, `git commit`, `git push`)

## Step 2 — Create the free database (5 minutes)

1. Go to https://neon.tech → sign up (free, no card)
2. Click **Create project** → pick the region closest to your players
3. When it finishes, copy the **connection string**. It looks like:
   `postgresql://neondb_owner:XXXX@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require`
4. ⚠️ Use the **pooled** connection string (it has `-pooler` in the hostname) —
   free serverless hosting needs pooling.

## Step 3 — Deploy on Vercel (5 minutes)

1. Go to https://vercel.com → sign up **with your GitHub account**
2. Click **Add New → Project** → import your `ffzone` repo
3. Before clicking Deploy, open **Environment Variables** and add:
   - Key: `DATABASE_URL`
   - Value: the Neon **pooled** connection string from Step 2
4. Open **Build & Development Settings** and set the **Build Command** to:
   ```
   node scripts/migrate.mjs && npx tsx src/db/seed.ts && next build
   ```
   - `scripts/migrate.mjs` is a bulletproof, prompt-free migration: it creates
     every missing table/column/index, reshapes rooms to the live 3-room
     layout, and is 100% idempotent — safe on every single deploy.
   - `seed.ts` fills the community on a brand-new database and safely skips
     itself afterwards.
   - **Use this command even if you previously used `drizzle-kit push`** —
     it fixes any schema drift automatically.
5. Click **Deploy**. In ~2 minutes you get a live link like
   `https://ffzone.vercel.app` — **that's your real website. Free forever.**

## Step 4 — Test it like a real player

1. Open your link on your phone **and** your laptop (or send it to a friend)
2. Register on both devices → chat in **Global Chat**
3. You'll see each other's messages appear within 3 seconds. ✅ That's it —
   you're live.

## Step 5 — Free custom touches (optional)

- **Custom name:** On Vercel, Settings → Domains → claim
  `ffzone.vercel.app` style subdomain (free). A real `.com` costs ~$10/year
  *only when you want it* — skip it until you're earning.
- **Analytics:** Vercel → Analytics tab → enable (free) to watch visitor
  counts go up. 📈
- **When you outgrow in-memory rate limits:** add Upstash Redis free tier
  (10k requests/day free) — only when you have thousands of players.

---

## 🎛️ Controls you have as the owner

### 🔐 The Vault key

After deploying, open `/chat/vault` as your founder account. If the Vault has
no key yet, you'll see **"Forge the key"** — set the passcode there. Founders
can rotate the key anytime from inside the Vault (🗝️ vault key button). The
passcode is stored only as a salted scrypt hash — it never touches any
browser, and unlock attempts are rate-limited (5 per 15 minutes).

Run these in the **Neon SQL editor** (Console → SQL) any time:

```sql
-- Open more seats when the hype demands it (10 → 50)
update settings set value = '50' where key = 'max_players';

-- See everyone waiting in line
select id, nickname, note, created_at from waitlist order by id;

-- See your founding squad
select id, username, uid, xp from users where founder = true order by id;

-- Promote a waitlist player: raise the cap, then tell them to register.
```

## 🛡️ What's already protected

- **Server-side truth:** XP, ranks, seats and messages are only ever changed
  by the server. Editing the page in a browser changes nothing for anyone.
- **EMBERCROWN Guard:** right-click/F12/dev-tools tampering triggers a lockdown
  screen + strike counter.
- **Rate limits:** chat (8 msg/10s + 1.5s cooldown), signups (5/hour),
  login (10/15min), likes (30/min), replies (10/min), topics (5/hour).
- **Bot traps:** hidden honeypot fields on every form + script-injection
  filters on all content.
- **Security headers:** CSP, clickjacking protection (frame-ancestors DENY),
  nosniff, permissions locked down.
- **Passwords:** hashed with scrypt — never stored in plain text.

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
Normal for ~3 hours — messages self-destruct. The migration automatically
refreshes ancient seeded messages once, so the demo chat comes back to life
on the first deploy after this update.

## 📣 Getting your first 10 players (also free)

1. Share your link in Free Fire Facebook groups + WhatsApp status
2. Post a YouTube Short: *"I built a website with only 10 seats for FF
   players"* — scarcity gets clicks
3. Drop the link in FF Discord servers with: *"First 10 players get the
   FOUNDER badge forever"*
4. Watch the waitlist number grow. That number IS your marketing. 🔥
