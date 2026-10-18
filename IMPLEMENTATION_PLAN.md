# VYRON Implementation Plan

## Current State Analysis

**Existing Features (Verified):**
- ✅ Forum with topics, replies, likes, categories, XP system
- ✅ Chat rooms (Global, Guides, Vault) with 3h self-destruct
- ✅ Direct Messages
- ✅ Replies system (forum topics) with XP rewards
- ✅ Reactions/Likes on topics with unique constraint (prevents duplicates)
- ✅ Browser push notifications for chat/DM
- ✅ Authentication (sessions, scrypt, httpOnly cookies)
- ✅ Vault (password-sealed, token-based)
- ✅ Voice notes in Vault
- ✅ Friends/Blocks system
- ✅ Rank system (Bronze → Grandmaster)
- ✅ Founding Squad (10 seats)
- ✅ Security: rate limits, bot traps, injection filters, CSP headers
- ✅ Seed data with bots, topics, replies, likes

**Architecture:**
- Next.js 16 (App Router) + React 19
- Drizzle ORM + Neon PostgreSQL
- Tailwind CSS 4
- Server-side rendering with force-dynamic pages
- No paid dependencies

## Phase 1: Brand Transformation (Crownember → VYRON)

### Files to Update:
1. `package.json` - name field
2. `src/app/layout.tsx` - metadata, title template, description
3. `src/app/page.tsx` - landing page content, hero, features, CTAs
3. `src/components/navbar.tsx` - wordmark "CROWNEMBER" → "VYRON"
4. `src/components/footer.tsx` - wordmark, description
5. `src/app/opengraph-image.tsx` - OG image text
6. `src/app/chat/page.tsx` - chat brand bar
7. `src/app/login/page.tsx` - login page branding
8. `src/app/register/page.tsx` - registration branding
9. `src/components/notification-center.tsx` - notification tag references
10. `src/db/seed.ts` - seeded content references
11. `src/components/ui.tsx` - FounderChip text (if referencing Crownember)
12. `DEPLOYMENT.md` - documentation references

### Design Direction: Luxury Black & White
- Remove orange/fire accent colors
- Use pure black (#000), white (#fff), and refined grays
- Create distinctive VYRON wordmark and geometric symbol
- Minimal, confident, timeless aesthetic

## Phase 2: Feed & Social Experience Improvements

### Home Page (`/`) - Transform to Social Feed
- Replace Free Fire gaming content with general social feed
- Show recent topics, replies, activity
- Clean, scannable post hierarchy
- Better empty states

### Forum Pages
- Improve topic list readability
- Better reply display in topic pages
- Enhanced like button UX

### Chat Pages
- Clean up gaming-specific language
- General-purpose chat rooms

## Phase 3: Replies & Reactions Polish

### Replies (Already Exist - Improve)
- Better visual hierarchy
- Keyboard shortcuts (Cmd+Enter to submit)
- Optimistic updates with rollback
- Clear attribution to parent

### Reactions/Likes (Already Exist - Improve)
- Faster visual feedback
- Better active/inactive states
- Accessible keyboard support
- Touch-friendly mobile controls

## Phase 4: Notifications Enhancement

### Current: Browser push only for chat/DM
### Needed: In-app notification center for:
- Replies to your topics
- Replies to topics you participated in
- Likes on your topics/replies
- Mentions (if added)
- DM notifications (already partially there)

## Phase 5: Premium Interactions & Accessibility

- Consistent interaction states (idle, hover, focus, pressed, loading, success, error)
- Reduced motion respect
- Semantic HTML
- Visible focus states
- Touch targets ≥44px
- Proper ARIA labels

## Phase 6: Security & Migration Safety

- Preserve all existing security controls
- No database schema changes needed for brand rename
- Cookie names stay `ff_session`, `ff_vault` (as documented)
- Verify auth, rate limits, moderation still work

## Phase 7: Testing & Verification

- Run existing unit tests (`npm test`)
- Type check (`npm run typecheck`)
- Lint (`npm run lint`)
- Build (`npm run build`)
- Manual verification of key flows

## Risk Mitigation

- **NO database schema changes for brand rename** - only UI/content
- **Preserve cookie names** - documented in auth.ts and vault.ts
- **Keep existing Vercel URL** - no custom domain purchase
- **Zero budget** - no new paid dependencies
- **Test against disposable DB** before any migration

