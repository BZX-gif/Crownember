# VYRON private groups — Slice A

Status: **foundation shipped** (schema, permissions, groups, members,
invitations, pictures, tests). Private group **messages, events and
announcements are deliberately not built yet** — they are Slice B, and they get
their own member-only storage rather than reusing the public `messages` table.

---

## 1. The privacy contract

A private group does not exist for a non-member. Concretely:

| Attempt | Result |
| --- | --- |
| `GET /groups/7` as a non-member | VYRON's ordinary 404 page |
| `GET /api/groups/7` as a non-member | `404 {"error":"Group not found."}` |
| `GET /api/groups/999999` (never existed) | the **same** `404 {"error":"Group not found."}` |
| `GET /api/groups/7/members` as a non-member | same 404 |
| `GET /api/groups/7/picture` signed out or non-member | `404` with an empty body |
| Metadata / `<title>` / Open Graph on `/groups/*` | `"Private group"`, `robots: noindex` |
| Notification feed, sitemap, public pages | no group data at all |
| Someone else's invitation id | `404` (lookups are always scoped by session user) |

Two rules make this hold:

1. **One door.** Every group route and every group page calls
   `requireGroup()` / `requireGroupPage()` in `src/lib/groups/access.ts`. There
   is no route that reads `groups`, `group_members` or `group_invitations`
   without going through it. `not_found` and `forbidden` produce the *same*
   status and the *same* message, so ids cannot be enumerated.
2. **Server-rendered only.** Capabilities travel from server to client as
   plain data and only decide what to *draw*. No client module imports the db,
   the entitlement config, or the permission decision for an action.

The single intentional disclosure: an **approved** invitation shows that group's
name to the person it was addressed to (they cannot decide otherwise). Rows in
`proposed` state are filtered out of that inbox — a member's proposal is
internal to the group until a manager approves it.

### Why `src/app/loading.tsx` was removed

Verified against a production build (`next build` + `next start`, Next 16.2.6):
while a root `loading.tsx` exists, Next streams the shell immediately, so the
status line is already committed as `200` before the page body runs — and every
`notFound()` in the app answered **HTTP 200** with the not-found UI instead of
404. That affected the existing `/forum/[id]` and `/players/[username]` routes
too, not just groups.

| Route (signed out, production build) | with root `loading.tsx` | without it |
| --- | --- | --- |
| `/groups/1` | 200 | **404** |
| `/groups/abc` | 200 | **404** |
| probe page calling `notFound()` | 200 | **404** |
| probe page under a segment with its own `loading.tsx` | 200 | 200 |

A private group must answer a guessed id the way a missing group does, with a
status a monitor, crawler or cache respects — so the global skeleton boundary
was removed. Index pages (such as `/groups`) render their header immediately and
stream their list inside a local `<Suspense>` boundary, while detail routes
(`/groups/[id]`, `/forum/[id]`, `/players/[username]`, `/chat/[slug]`,
`/messages/[username]`) run their `notFound()` guard before any `<Suspense>`
boundary so missing and forbidden ids always return a genuine HTTP **404**. If a
`loading.tsx` is added back later, add it only to segments with no child detail
route that calls `notFound()`, and re-check the status code of that segment's
detail routes.

---

## 2. Roles and permissions

`src/lib/groups/permissions.ts` is the only place a role becomes a capability.

| Capability | Owner | Admin | Member |
| --- | :-: | :-: | :-: |
| `viewContent` (details, member list, picture) | ✓ | ✓ | ✓ |
| `invite` (propose someone) | ✓ | granted | ✓ |
| `updateDetails` (name, description, picture) | ✓ | granted | — |
| `reviewInvitations` (approve / reject / revoke) | ✓ | granted | — |
| `manageMembers` (remove below your rank) | ✓ | granted | — |
| `manageEvents` (Slice B/C) | ✓ | granted | — |
| `moderate` (Slice C tooling) | ✓ | granted | — |
| `viewAuditLog` (Slice C storage) | ✓ | granted | — |
| `manageAdmins` | ✓ | **never** | — |
| `manageEntitlements` | ✓ | **never** | — |
| `transferOwnership` | ✓ | **never** | — |
| `deleteGroup` | ✓ | **never** | — |

Rules worth knowing:

- An admin holds **only** what was explicitly granted; the default grant on
  promotion is `updateDetails`, `invite`, `reviewInvitations`, `manageMembers`.
- `normalizeAdminPermissions()` rejects anything outside
  `ADMIN_GRANTABLE_PERMISSIONS`, so a hand-edited `admin_permissions` array
  cannot mint `transferOwnership`, `deleteGroup`, `manageAdmins` or
  `manageEntitlements` — `rolePermissions()` filters it again on read.
- Rank rule: equal ranks never act on each other (an admin cannot remove or
  re-rank another admin), and nobody acts on the owner.
- Owners cannot leave. They transfer ownership or delete the group. A database
  trigger (`group_members_owner_leave_guard`) refuses the DELETE even if the
  application layer is bypassed, and `group_members_owner_guard` keeps
  "exactly one owner row, and it is `groups.owner_id`" true at all times.

---

## 3. Invitations

```
proposed ──approve──▶ invited ──accept──▶ accepted   (the only path to membership)
   │                    │  └──decline──▶ declined
   ├──reject──▶ rejected└──revoke────▶ revoked
   └──revoke──▶ revoked      (expiry)─▶ expired
```

- Any active member with `invite` may **propose**. A proposal grants nothing.
- An owner/admin with `reviewInvitations` **approves**, which sends it.
- The invitee **accepts** it themselves. `acceptInvitation()` re-checks, inside
  a transaction holding `SELECT … FOR UPDATE` on the group row: invitation
  ownership, status, expiry, revocation, replay, current membership, account
  eligibility (not banned, not a bot) and capacity.
- Concurrent accepts serialize on that lock: exactly one wins at the boundary,
  the loser is told the group is full, and the count never exceeds the limit.
- One open invitation per (group, invitee) is enforced by a **partial unique
  index**, so a race between two proposers cannot create duplicates.
- Invitations live 7 days (`INVITATION_TTL_DAYS`). Stale rows are swept to
  `expired` whenever a list is read — no cron job, no background worker.
- Removing a member revokes any invitation still waiting for them.

---

## 4. Capacity and premium entitlements

All limit maths lives in `src/lib/groups/limits.ts`. Nothing else hardcodes a
cap.

- Free: **25** active members, owner included (`FREE_MEMBER_LIMIT`).
- Premium test tier: **100** (`PREMIUM_TEST_MEMBER_LIMIT`).
- Env overrides (server-only, never sent to a browser):
  `VYRON_FREE_GROUP_MEMBER_LIMIT`, `VYRON_PREMIUM_MEMBER_LIMIT`. A hard
  `ABSOLUTE_MEMBER_CEILING` of 10 000 means a typo can never mean "unlimited".
- A group's limit is, in order: `groups.max_members` (operator override) →
  live `group_entitlements` row → free default. Expired entitlements fall back
  automatically.

**Granting premium is an operator action, not an endpoint:**

```bash
npx tsx scripts/group-entitlement.ts grant  12        # 100 members
npx tsx scripts/group-entitlement.ts grant  12 150    # explicit limit
npx tsx scripts/group-entitlement.ts revoke 12
npx tsx scripts/group-entitlement.ts list
```

There is no HTTP route that writes `group_entitlements`, and no client-supplied
`isPremium` flag is read anywhere. A downgrade never removes existing members;
the limit only applies to new joins.

---

## 5. Pictures and upload security

`src/lib/images.ts` is shared by profile avatars and group pictures.

- The client's `Content-Type` is a **hint only**. The stored and served type
  comes from the file's magic bytes: PNG (signature **and** `IHDR` chunk),
  JPEG (`FF D8 FF`), WebP (`RIFF….WEBP` + `VP8 /VP8L/VP8X`).
- A renamed HTML/SVG/JS file is rejected, and `safeServeMime()` re-sniffs on
  the way out, so a legacy row whose stored mime says `text/html` can never be
  served as HTML from a same-origin URL. (`X-Content-Type-Options: nosniff`
  stays on every response.)
- Limit: 1 MB (`MAX_IMAGE_BYTES`); 512 KB for the inline picture at creation.
  Size is checked before the bytes are read.
- Group pictures are stored in PostgreSQL (`groups.picture_data`), like
  avatars — no paid storage provider, no new dependency.
- Group pictures are **members-only** and served with `Cache-Control: private`.

Legacy avatar rows written before the sniff existed can be reclassified with:

```bash
npx tsx scripts/fix-avatar-mimes.ts          # report only
npx tsx scripts/fix-avatar-mimes.ts --apply  # reclassify + bump avatar_version
```

It never deletes an avatar and never writes bytes it did not read.

---

## 6. Schema

Added by `scripts/migrate.mjs` (SQL lives in `scripts/migrations/schema.mjs` so
it can be reviewed and tested as data):

- `groups` — name, description, `owner_id`, `visibility` (`'private'`, the only
  allowed value today), picture columns, optional `max_members`, timestamps.
- `group_members` — `role` (`owner|admin|member`), `admin_permissions text[]`,
  `invited_by`, `joined_at`, `UNIQUE (group_id, user_id)`.
- `group_invitations` — `status` (7 explicit values), `invited_by`,
  `reviewed_by`, `message`, `expires_at`, `approved_at`, `decided_at`, plus the
  partial unique index for one open invitation per (group, invitee).
- `group_entitlements` — `tier`, `member_limit`, `granted_by`, `granted_at`,
  `expires_at`.

Everything is `CREATE … IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`, and constraints are added inside `DO` blocks that
swallow `duplicate_object` — so the migration is replayable. There is no
`DROP TABLE`, `DROP COLUMN`, `TRUNCATE` or `DELETE FROM` anywhere in it (a unit
test asserts this).

Prepared for later slices without a redesign: every future group-owned table
(messages, events, announcements, audit log) hangs off `groups.id` with
`ON DELETE CASCADE`; new capabilities are new strings, not new columns;
`visibility` already exists if discoverable groups ever ship.

Review the SQL without touching any database:

```bash
node scripts/migrate.mjs --dry-run
```

---

## 7. Tests

```bash
npm test          # unit tests, no database required
npm run test:db   # database integration tests (needs VYRON_TEST_DATABASE_URL)
```

- `tests/groups.test.ts` (runs in ordinary CI, no credentials): permission
  matrix for owner/admin/member/non-member, undelegable capabilities, forged
  admin rows, limit and entitlement maths, expired entitlements, the whole
  invitation state machine (approve/reject/revoke/expiry/replay/duplicate/
  not-the-invitee/capacity), image magic-byte validation and MIME spoofing,
  group text validation, and the migration's additive/idempotent properties.
- `tests/groups.integration.test.mts` (skips itself unless
  `VYRON_TEST_DATABASE_URL` is set): group creation and initial owner
  membership, guessed-id privacy, the full invitation lifecycle, expiry and
  revocation, capacity, **concurrent acceptances at the boundary**, unauthorized
  removals and admin management, ownership transfer, cascade on delete,
  picture storage, entitlement reads, and migration idempotency with data
  preservation.

Running the integration suite:

```bash
export VYRON_TEST_DATABASE_URL="postgresql://user:pass@host:5432/vyron_test"
npm run test:db
```

Use a **disposable** database: the suite applies the migration SQL, creates
users named `t_<run>_*`, and drops everything it created at the end. It never
reads `DATABASE_URL` from your environment unless you point it there, and
ordinary CI never needs credentials.
