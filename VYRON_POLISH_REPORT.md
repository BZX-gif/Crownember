# VYRON — product polish pass

Scope: whole product (feed, forum, profiles, rooms, DMs, notifications, auth, Vault,
error/404 states), not a homepage refresh. No schema changes, no new runtime
dependencies, no route changes, no data changes.

## What changed

### Correctness found by running the app
- **Every avatar requested a picture that did not exist.** `<Avatar>` defaulted to
  `/api/profile/avatar?username=…` for all members, so pages with real data fired a
  stream of 404s and showed the browser's broken-image glyph over the initials
  (visible in the browser QA run). Avatar URLs are now emitted only for members who
  actually uploaded one (`hasAvatar`, derived from `users.avatar_mime`), and a failed
  image — including one that fails before hydration — falls back to initials.
- **Hydration mismatch (React #418) on `/chat` and `/messages`.** The room-activity
  timestamp was rendered with `Date.now()`-relative text on the server and again in
  the browser. Relative times now render through a `RelativeTime` client component
  with an exact `dateTime`/tooltip, so server and client agree.
- **DM/room countdowns never ticked.** `ExpiryCountdown` computed "time left" once per
  render and then sat frozen until an unrelated state change. It now updates on a
  30-second client tick, with a hydration-safe first paint.
- **Mobile overflow on the home page (377 px scroll on a 390 px viewport).** The hero
  headline could not shrink inside its grid column; long titles, excerpts and URLs
  now wrap anywhere instead of widening the page.
- **Toast semantics.** The live region had `role="status"` around interactive
  buttons; errors auto-dismissed in 4.5 s. Errors now persist 8 s, all toasts pause
  while hovered or focused, and the live region no longer wraps controls.

### Design system
- One control scale (`xs 28 / sm 32 / md 40 / lg 48`, icon and icon-sm), unified
  hover/active/disabled states, `aria-invalid` styling for inputs, and a
  `.tap-target` helper giving inline 28 px controls a 40 px hit area without
  changing layout.
- Type floor raised: no 9–10 px interface text remains; metadata is 11 px, body
  13–15 px. `--color-subtle` lifted for contrast, and a `--color-info` token added so
  toast variants are not colour-coded by guesswork.
- Semantics: decorative duplicate avatar links are out of the tab order, profile
  stats are a valid `dl` (term before value, no wrapper divs), header icon links that
  hide their label on phones have accessible names, the leaderboard is a
  two-state group rather than an ARIA tablist without arrow-key support, and the
  account menu drops `role="menu"` (it is a link list) while keeping Escape,
  focus-on-open and focus restoration.

### Screens
- **Nav:** account menu and notification panel share one surface/elevation; friend
  requests no longer masquerade as unread *messages* (the count moved to the account
  button and the account menu); mobile tabs are 11 px labels with a 56 px row and a
  top indicator.
- **Profiles:** larger flat cover band, avatar that overlaps it on desktop and stacks
  cleanly on phones, tighter name/rank/metadata hierarchy, stats with the label above
  the value, and upload/remove photo as two small buttons on the avatar itself
  instead of a cramped text row.
- **Feed and forum:** one metadata line per post (category · like · replies · reply),
  consistent filter heights, readable empty/archive states, and a leaderboard row
  that no longer collides with itself at 320 px.
- **Rooms and DMs:** 44 px composer inputs and send buttons, 40 px back buttons,
  larger reaction targets, message headers that drop badges on narrow phones instead
  of wrapping into four lines, room counts labelled "active" with the 3-minute
  definition in the tooltip, and DM "clears in 2h 59m" wording.
- **Error state** now uses the shared buttons and says what actually happened.

### Second review pass (caught in the before/after comparison)

- **The notification panel was clipped on phones.** Positioned `right-0` against a
  bell that sits ~60 px from the right edge, its 92vw width overflowed the viewport
  by 323 px. It is now a fixed sheet inset 16 px on phones and only anchors to the
  bell from `sm` up.
- **The fixed tab bar sat on top of the footer's last line.** The footer reserved
  the bar's height but the page bottom added no breathing room of its own; the
  clearance is now 68 px, so the copyright and the bar no longer touch.
- **Auth pages rendered the brand twice on phones** — once in the header and again
  inside the page — and the header showed "Join VYRON" while the visitor was
  already on `/register` (and "Sign in" on `/login`). Both are gone; the redundant
  top margin that only existed for the second logo went with them.
- **`/forum/new` opened with advice cards instead of the form on phones.** On a
  narrow screen the sidebar comes first in DOM order, so the title field began
  below the fold. The form now leads and the two reference cards follow it.
- **The 404 page left a dead band under the copy.** Its min-height was 70dvh
  inside a layout that already accounts for the header; it now fills the viewport
  minus the header.
- **Inbox heading said "Private".** A single adjective as the page's only h1 was
  vague; it reads "Private messages" and the eyebrow says "Inbox".
- **The account menu carried no role.** It is a dialog-like popover with focus
  management, so it now has `role="dialog"` and an accessible name to match the
  notification panel.

### Before / after

Captured from the same database, same account, same viewport, from the pre-polish
build (`3c6fbaa`) and this branch: `docs/polish/` —

| File | What to look at |
| --- | --- |
| `home-desktop.jpg` | Broken-image glyphs replaced by initials; post metadata on one line |
| `players-mobile.jpg` | Leaderboard chips/progress no longer colliding at 390 px |
| `profile-mobile.jpg` | Cover band, stacked hero, label-above-value stats |
| `notifications-mobile.jpg` | Panel no longer clipped off the left edge |
| `login-mobile.jpg`, `register-mobile.jpg` | One brand lockup, no contradictory header CTA |
| `messages-mobile.jpg` | "Private messages" heading |
| `topic-mobile.jpg` | Reply composer clear of the tab bar |
| `notfound-mobile.jpg` | Content vertically centred, no dead band |


## Verification

Local production build against a real Postgres-compatible database (PGlite over the
wire protocol, migrated with `scripts/migrate.mjs` and seeded with `src/db/seed.ts`),
driven by headless Chromium at 1440/1180/834/390/320 px.

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | pass |
| `npm run lint` | pass, 0 warnings |
| `npm test` | 16/16 |
| `npm run build` | pass, 0 warnings |
| Horizontal overflow, 18 routes × 320/390/1440 | 0 px everywhere |
| Hydration/console errors, 13 routes × 3 widths | 0 |
| axe-core WCAG 2.1 A/AA, 13 routes × 390/1440, signed in and out | 0 violations |
| Login through the form, notifications open + Escape, account menu | pass |
| Like toggle → server count → persists after reload | pass |
| Reply posted through the composer and rendered in the thread | pass |
| Register form stays disabled for empty/invalid input | pass |
| DM send from a 390 px phone with 44 px composer | pass |
| Console/network failures during the interactive run | 0 |

Measured after the pass (signed in, local production build): home 606 DOM nodes,
245 KB script; forum 377 nodes; topic 304 nodes; profile 387 nodes; room 151 nodes;
inbox 132 nodes; one API request per route; first contentful paint 140–290 ms.

## Not verified here
- Real-device rendering (iOS Safari, Android Chrome), including `env(safe-area-inset-*)`
  behaviour, which the sandbox cannot reproduce.
- Avatar upload end-to-end with a real image (the API path was exercised only for
  the 404/fallback case; upload needs a file picker).
- The Vault passcode/voice-note flow (needs mic permission and a passcode hash).
- Production deployment of this change — nothing has been pushed live by this pass.
- Lighthouse scores; the numbers above are Chromium performance entries, not a
  Lighthouse audit.
