# VYRON 2.0 — Product Rescue Report

Status: **implemented, merged and deployed.**
Production is running this build (`/api/health` → `version: "2.0"`,
`schema: "up to date"`, `features.profilePictures: true`,
`features.chatReactions: true`). See §9 for the live checks.

Everything below is based on the repository at commit `be6b6db` plus the
changes in this branch. Claims marked **verified** were reproduced with the
commands in §8. Claims marked **assumed** were not reproducible in this
environment (no database, no browser).

---

## 1. Why the logo was invisible — and the fix

**Cause (verified in source, reproduced on the live site):** every logo was an
inline `<svg>` whose background was `<rect fill="currentColor">` and whose
detail was drawn in white. Inside a white-on-white context — or with a
currentColor that inherited the page's white text — the mark rendered as a
plain white square. There were five hand-copied versions (navbar, footer,
login, register, chat), so they also drifted. The favicon was a different
orange flame (`src/app/icon.svg`), `public/icon.svg` was a three-bar tile used
nowhere, and `favicon.ico` was a 32 KB legacy file. `layout.tsx` declared no
icons at all.

**Fix (verified locally in the production build):**

- One shared component, `components/brand.tsx`: a solid white rounded tile with
  a real geometric **V** cut out in near-black, plus a `Wordmark` with wide
  tracking. It is high-contrast in both directions (white tile on dark page,
  dark V inside the tile).
- Used by the navbar, footer, auth pages, chat/messages app bars and the home
  hero. Accessible name comes from the parent `Link` (`aria-label="VYRON —
  home"`); the mark itself is `aria-hidden`.
- App icons replaced and regenerated: `public/icon.svg` and `src/app/icon.svg`
  (identical, white V on `#050505`), `icon-192.png`, `icon-512.png`,
  `apple-touch-icon.png`, and a fresh multi-size `favicon.ico` (16/32/48/64).
  Maskable safe zone respected.
- `manifest.json` rewritten (`#050505`, 192/512 any + maskable).
- `layout.tsx` declares icon, shortcut, apple-touch-icon, manifest, theme
  colour, Open Graph and Twitter metadata.
- `opengraph-image.tsx` redrawn with the same mark and typography; verified as
  a 1200×630 PNG (§8).

## 2. Route-by-route audit (what was actually old)

| Route | Previous state | Now |
| --- | --- | --- |
| `/` | Seat HUD, particles, 6 `Reveal` wrappers starting at `opacity-0`, duplicate session/seat queries, emoji room cards, fake leaderboard | Server-rendered editorial home; one aggregate count query; real non-bot feed; honest empty states |
| `/forum` | Emoji categories, `clip-*` / `font-display` classes, unbounded list | 20/page pagination, category + latest/popular, shared `PostRow`, bot-filtered |
| `/forum/[id]` | Orange/gaming detail, duplicate empty state | Byline, like, reply timeline with composer, `#replies` anchor |
| `/forum/new` | “+10 XP”, UID copy, no validation | Real form: 3–120 title, 4000 body with counters, category picker, server error handling |
| `/players` | “players”, Bronze→Grandmaster medals, **public UID column**, bot leaderboard | People list: reputation/appreciation tabs, `RankBadge`, no UID, bots excluded |
| `/players/[username]` | Gaming rank chips, ⚡ actions, no ownership model | Profile with avatar upload, XP progress, topic/reply stats, friend/block/message actions, sealed state |
| `/login`, `/register` | Old HUD card, UID/“External ID”, “SOLD OUT” waitlist, fake seat meter pulse | Two-column auth on tokens; client validation; no UID; honest founding-seat panel; waitlist without invented queue counts |
| `/chat` | “0 online”, emoji room tiles, `bg-grid` glow, full-height naked page | App shell with its own brand bar; rooms list with retention, honest per-room “here” count, guest read state |
| `/chat/[slug]` | Emoji header, orange bubbles, “Fire →”, 3 s poll, stickers, dev flair, reload-based actions | App bar, grouped messages, persisted reactions, sticker picker preserved, voice panel, 6 s visibility-aware refresh, server-rendered first paint |
| `/messages` | “Private lines”, `clip-card`, orange glow | App shell inbox: requests, threads, friends; no fake counts |
| `/messages/[username]` | Orange bubbles, 3 s polling, client-only reaction picker | Server-rendered thread, 6 s visibility-aware refresh, edit window, reply, sealed state |
| `error.tsx` | “The platform is reconnecting”, emoji shield, console-style debug copy | Neutral error card with reference digest, retry and home |
| `not-found.tsx` | *did not exist* | Branded 404 |
| `loading.tsx` | *did not exist* | Shared skeleton |
| `opengraph-image.tsx` | Gradient + 3-bar mark + marketing line | Brand card with the V mark |

Deleted dead/duplicative code (no importers; verified before removal):
`global-chat-actions.tsx` (2.5 s polls + DOM scrape + `location.reload()`),
`topic-list.tsx` (superseded by `post-row.tsx`), `rooms-sidebar.tsx` (never
imported), `dev-message.tsx`, `reveal.tsx`.

## 3. What was redesigned on shared tokens

`globals.css` is a new token system (ink `#050505`, panel, raised, elevated,
line, `#f4f4f5` text, controlled grays, restrained success/danger). It defines
`.page-shell`, `.eyebrow`, `.surface*`, `.display-title`, `.prose-body`,
`.mono-meta`, `.skeleton`, `.spinner`, skip link, focus ring and a
reduced-motion reset.

Shared components now used across the product: `Brand`, `Avatar` (initials
first, image as enhancement), `RankBadge`/`FounderChip`/`DevChip`,
buttons/inputs/fields/chips/empty/notice/skeletons (`primitives.tsx`),
`ToastProvider`, `NotificationBell`, `PostRow`, `TopicActions`, `LikeButton`,
`ReplyComposer`, `Replies`, `ProfileActions`, `EditableAvatar`, `VaultGate`,
`VoicePanel`, `ChatRoom`, `DmInbox`, `DmThread`, `Chrome`.

No component library was added and no framework was changed. The visual
gaming vocabulary (orange, neon, gradients, glow, emoji-as-icons, `clip-*`,
`font-display`/`font-hud`, `.text-fire`, `bg-grid`, HUD corners) is gone from
`src/**/*.tsx` — verified by grep; only two explanatory comments mention the
old “Free Fire” origin.

## 4. Lag: the real causes found in code

1. `Navbar` polled `/api/me`, `/api/access` and `/api/chat/rooms` every 30 s for
   every visitor, and `/api/me` wrote `last_seen_at` on each poll.
2. `NotificationCenter` polled every 5 s even in hidden tabs.
3. `ChatRoom` and `DmThread` polled every 3 s with no visibility check.
4. `RoomsSidebar` polled every 20 s.
5. `GlobalChatActions` polled every 2.5 s, scraped the DOM, and called
   `location.reload()`.
6. `purgeExpiredMessages()` ran on every chat/DM GET.
7. Every route was `force-dynamic`, sessions were fetched repeatedly per
   request, and independent queries were awaited serially.
8. Chat and DM screens had no server-rendered history, so every visit began
   with a spinner and an empty window.
9. Avatars were plain `<img>` requests that 500s in production (see §7), and
   some lists were unbounded.

## 5. Performance changes (each one is an identified change)

| Area | Before | After |
| --- | --- | --- |
| Navbar | 3 requests / 30 s, always | 0 polls (server-rendered count; bell is separate) |
| Notifications | 5 s, always | 90 s, only visible; refresh on return if stale |
| Chat room | 3 s + reactions request + presence write | 6 s, visible only, one request, presence write ≤1/min |
| Direct messages | 3 s | 6 s, visible only |
| Room list | 20 s poll | server-rendered |
| Global actions | 2.5 s + reload | removed |
| First chat/DM paint | spinner then fetch | server-rendered messages |
| Purge sweeps | every request | ≤1 per 60 s (`lib/purge.ts`) |
| Session | re-queried | request-scoped `cache()` |
| Feed/forum | unbounded | home 10, forum 20/page, replies 200, DMs 80 |

Build measurement (this branch, production build): **223 KB gzipped client
JS across all chunks, 9 KB gzipped CSS** — no client component library, no
chart/animation dependency. Numbers are totals, not per-route budgets.
No performance claim beyond these reductions is made; no Lighthouse run was
possible without a browser.

## 6. Feed, replies, reactions, notifications

- **Feed**: real non-bot topics, latest or popular, blocked authors removed
  server-side, like state resolved for the viewer, pagination.
- **Replies**: server-rendered list plus a client composer with 2000-char
  limit, character counter, ⌘/Ctrl+Enter, an 8 s duplicate-submit guard, and
  optimistic append only after the server confirms. The reply count now links
  to `#composer`.
- **Reactions**: server-authoritative topic likes (returned `liked`/`likes`,
  rate-limited, ownership enforced). Chat reactions are persisted and were
  moved out of the lazy “first action creates the table” path (see §7);
  optimistic UI rolls back on failure.
- **Notifications**: derived from existing records (replies to your posts,
  likes on your posts, pending friend requests, newest DM per sender) — no new
  table, no invented badges. 30-day window, max 30 items, blocked actors
  excluded, read cursor in the existing `settings` table, mark-all-read
  rate-limited to 30/min. Every row links to the correct page (`#replies`,
  post, inbox, thread). Desktop alerts are opt-in and local; there is no push
  service and no paid dependency.
- **Unread honesty**: the bell shows a dot and a count only when real events
  are newer than the cursor. No “online users” are fabricated; room presence is
  derived from distinct people who actually spoke in the last 3 minutes.

## 7. Security and data integrity

Preserved exactly: cookie names `ff_session` / `ff_vault`, scrypt hashing with
the dummy-hash timing defence, session expiry, Vault 7-day token + rotation
revoking all tokens, no default Vault passcode, rate limits (login 10/15 min,
register 5/h/IP, chat 8/10 s + 1.5 s cooldown, replies 10/min, likes 30/min,
topics 5/h, Vault unlock 5/15 min, notifications 30/min), honeypot, injection
regex, moderation ladder, block filtering, bot login refusal, CSP and security
headers. `/api/notifications` is authenticated and every query is scoped to
the caller; no private message content is exposed outside its two participants.

Data changes (all additive, idempotent, in `scripts/migrate.mjs`):

- `users.avatar_data`, `avatar_mime`, `avatar_version` — previously only in a
  hand-run SQL file, which is why `/api/profile/avatar` returned 500 in
  production.
- `messages.reply_to_id` and `chat_message_reactions` — previously created
  lazily by the first chat action.
- The migration **no longer** rewrites room names/copy, deletes rooms, or
  re-dates old messages. That behaviour was removed; the UI owns presentation.
- Avatar reads now return a 404 fallback instead of a 500 when the columns are
  missing, and use an ETag derived from `avatar_version`.
- `/api/health` now also checks the avatar columns, `reply_to_id` and the
  reactions table.

Registration no longer accepts or stores an external UID; the legacy `uid`
column is retained for existing accounts but is never serialized to a browser
(verified by unit test). Existing Vault passcodes are untouched.

## 8. Tests actually run

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean, exit 0 |
| Lint | `npm run lint` | clean, 0 errors/warnings |
| Unit tests | `npm test` | **16/16 pass** (12 original + 4 new product rules: rank boundaries, room display/emoji stripping, no-UID serialization, avatar cache version) |
| Production build | `DATABASE_URL=postgres://user:pass@127.0.0.1:5432/vyron npx next build` | success, no warnings, 30 routes compiled |
| Static assets (local `next start`) | `curl` | `/icon.svg` 200, `/manifest.json` 200, `/favicon.ico` 200 (4 sizes), `/apple-touch-icon.png` 200, `/icon-192.png` 200, `/opengraph-image` 200 PNG 1200×630 |
| 404 | `curl /missing-page` | HTTP 404, branded page renders |
| Auth page markup | `curl /login` | title `Sign in · VYRON`, 7 logo instances in HTML, zero legacy tokens (`clip-`, `font-display`, `text-fire`, `Crownember`, `Free Fire`, `orange`) |

**Not run:** database-backed route/API tests, reply/like/notification
integration tests, and screenshots. This environment has no PostgreSQL and no
Chromium/Playwright, and browser downloads are outside the allowed hosts. No
claim is made that these passed.

## 9. Live deployment status — verified

- PR [#13](https://github.com/BZX-gif/Crownember/pull/13) and follow-up PR
  [#14](https://github.com/BZX-gif/Crownember/pull/14) merged to `main`.
  Merge commits `721a4a4` and `a825d5b`; Vercel production deployment
  `7165072671` reported `success`.
- `https://crownember.vercel.app/api/health` (fetched after deploy):
  `{"ok":true,"version":"2.0","db":"connected","schema":"up to date",
  "features":{"profilePictures":true,"chatReactions":true}}` — i.e. the build
  migration added the avatar and chat-reaction schema, so the previous
  `/api/profile/avatar` 500 is fixed at its root.
- Live pages re-checked and confirmed new: `/` (editorial home with real
  counts and founding seats), `/players` (new ranks, **no UID column**),
  `/players/Annabella` (new profile, stats), `/chat` (new room list, honest
  retention copy), `/chat/global` (server-rendered room with guest state),
  `/login`, `/register` (no UID field), `/messages`, `/forum`, `/forum/10`.
- `/api/notifications` returns `401 {"error":"Sign in to view notifications."}`
  on the live site, confirming the new route is deployed and gated.
- `/manifest.json` on the live site is the new VYRON manifest.
- Binary assets (SVG/PNG) cannot be opened by the page-fetch tool used from
  this sandbox, and shell TLS to the site is blocked. They were verified in a
  local production server (§8) and the manifest references the new files, but
  a browser screenshot of the icons/avatars is still a manual check.

## 10. Remaining issues and manual steps

1. **Browser pass**: open the live site signed in, upload one profile photo,
   reply to a post and confirm the notification appears. Those flows passed
   type/build checks and the schema is verified, but no browser was available
   here for a visual/interaction pass.
2. **Icons**: visually confirm the white V in a browser tab, on a phone home
   screen and in the OG preview (assets and manifest are deployed; the fetch
   tool here rejects binary files).
3. **Seed data**: a *brand-new* database still seeds bot members and demo
   topics (hidden from every UI query by `is_bot = false`, and bots cannot log
   in). No production data was deleted. If you want a completely empty launch,
   remove the demo section of `src/db/seed.ts` before the first deploy.
4. Old `public/images/hero.jpg` and `arena.jpg` are unreferenced and can be
   deleted manually.
5. Full-window chat refresh every 6 s is a deliberate trade for honest TTL
   (messages that expire disappear without trusting the client). An incremental
   protocol would need a server-returned expiry list; not attempted.
6. Visual QA on real devices, real login/reply/like/notification flows, and a
   Lighthouse pass remain manual because this sandbox has no database or
   browser.
7. Existing production rooms still carry old names/descriptions in the
   database (community data). The UI overrides them via `lib/rooms.ts`; the
   rows are intentionally not rewritten.

## 11. ₹0 confirmation

No paid services, domain, templates, icon packs, analytics, fonts, APIs or
subscriptions were added. No runtime dependency was added. Icons and the logo
are hand-written SVG; images are generated locally with ImageMagick. The
existing free Neon + Vercel stack is unchanged.
