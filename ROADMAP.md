# VYRON — Future Roadmap

Philosophy: **build smart now, invest big later.** Everything below is
categorized by when it actually becomes worth doing. Nothing on this list is
implemented yet — this is deliberate, honest planning.

## Needed now — ₹0 (small, safe, high-value)

- **Rotate the Vault key once** if your database predates the security pass
  (an old default key exists in repo history). Rotate from inside the Vault —
  it revokes everyone's unlock and the new key becomes the only way in.
- **Ask early members to use 8+ character passwords.** New signups enforce it;
  older accounts can keep working until they change.
- **Share the site** using the existing free channels listed in DEPLOYMENT.md.
- **Occasionally check `/api/health`** after deploys (it explains exactly what
  is wrong when something breaks).

## Useful later — still ₹0 or near-free

- **Email-based password reset** — needs a free-tier email sender (e.g. a
  transactional email free tier) or a verification-code flow. Until then,
  `scripts/reset-password.ts` covers owner-run recovery.
- **Push notification when the Founding Members opens seats** (waitlist →
  account link). Could reuse the existing browser Notification permission.
- **Forum rich previews / link unfurls** — pure server rendering, no services.
- **Moderation dashboard for the owner** (strikes, mutes, blocks) as a
  server-rendered admin page gated to `is_dev` — replaces manual SQL checks.
- **Rate-limit durability** — move the in-memory limiter to a shared store
  only when traffic outgrows a single serverless instance (Upstash free tier
  or a Neon table). Not urgent at 10 members.
- **Weekly digest of leaderboard movement** — fun retention content, generated
  server-side into the forum (no email needed).

## Only worth paying for when VYRON has real traction

- **Custom domain** (~₹800–1200/year) — worth it once users arrive from
  outside the founder circle and brand recall matters.
- **Managed email service** — when self-serve password reset and
  notifications matter more than ₹0/month.
- **CDN / image optimization quota** — only if media storage grows beyond the
  free tier.
- **Real-time WebSocket infra** — only if polling costs or latency become
  user-visible problems. Smart polling is perfect at this scale.
- **Dedicated database tier** — only when the Neon free tier's limits show up
  in real usage.

## Explicitly rejected (for now)

- Fake online counters, activity feeds, or statistics of any kind.
- Client-side "anti-hack" lockdowns — they annoy real users and stop
  nobody. Server-side verification is the only real protection.
- Any paid AI, analytics, or marketing tool.