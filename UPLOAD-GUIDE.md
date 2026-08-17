# 📤 EMBERCROWN — Upload & Deploy Guide

## The golden rule
GitHub's web uploader **adds files but never deletes old ones**. Old leftovers
+ new files = route conflicts = *"Turbopack build failed with N errors"*.

**Safest flow (recommended every time the structure changes): a fresh repo.**

## Fresh-repo deploy (5 minutes, zero risk)
1. github.com → **New repository** → name it `embercrown` → Create
2. Click **uploading an existing file** → drag in the WHOLE project:
   - folders: `src/`, `scripts/`, `public/`
   - files: `package.json`, `package-lock.json`, `next.config.ts`,
     `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`, `.env`
     (optional), `DEPLOYMENT.md`
3. Commit.
4. Vercel → **Add New → Project** → import `embercrown`.
5. Before deploying:
   - **Environment Variables:** `DATABASE_URL` = your Neon **pooled**
     connection string (the one with `-pooler` in it)
   - **Build Command** (Build & Development Settings):
     ```
     node scripts/migrate.mjs && npx tsx src/db/seed.ts && next build
     ```
6. Deploy → watch for `✅ migrate: schema reconciled` → done.

## Re-uploading into an EXISTING repo
Safe now — pages live at their original paths, so dragging a fresh `src/`
over the old one overwrites cleanly. **One-time cleanup if you ever uploaded
the route-group version:** delete the folders `src/app/(site)` and
`src/app/(chat)` in GitHub first (they conflict with the flat structure).
Then upload: `src/`, `scripts/`, `public/`, `package.json`,
`package-lock.json`, `next.config.ts`. Commit → Vercel auto-deploys.

## After EVERY deploy — the 10-second ritual
Open `https://your-site.vercel.app/api/health`:
- `"db": "connected"` → all good 👑
- `"db": "missing"` → **new Vercel projects start with NO env variables.**
  Add `DATABASE_URL` (Settings → Environment Variables, Production ✓) with
  the Neon pooled string, then **Deployments → Redeploy**.
- `"hint": "...STALE PASSWORD..."` → update `DATABASE_URL` env variable with
  the newest Neon string, then **Deployments → Redeploy**
- `"hint": "...schema..."` → build command is wrong, see step 5 above

⚠️ Seeing the **"The arena is reconnecting 🛡️"** screen on the site?
That shield always means one of the above — `/api/health` says which one.

## Reading the Vercel build log
Only these lines matter:
1. `✅ migrate: schema reconciled · rooms=3 ...`
2. `✓ Compiled successfully`
Everything else (npm warnings etc.) can be ignored.
