# App Router Migration: break page.tsx into real routes

## Context
`page.tsx` is ~1246 lines and growing. Instead of an intermediate refactor that keeps tab state, we're going straight to Next.js App Router routing. Each tab becomes a real route (`/feed`, `/calendar`, `/squads`, `/profile`). Navigation uses `next/navigation` instead of `useState<Tab>`.

## Why App Router
- File-based routing — each tab is its own folder, easy to find
- Client-side navigation — `router.push('/feed')` still feels instant (no full reload)
- Shared layout — header, bottom nav, modals, overlays live in `layout.tsx`
- Sets us up for server components, parallel routes, and other Next.js features later

## Architecture

```
app/
├── layout.tsx              ← existing (html, body, fonts, meta)
├── (app)/                  ← route group (no URL segment)
│   ├── layout.tsx          ← AppProvider + AppShell (auth guard, header, nav, modals)
│   ├── page.tsx            ← redirect to /feed
│   ├── feed/
│   │   └── page.tsx        ← FeedTab (FeedView + tonight mode)
│   ├── calendar/
│   │   └── page.tsx        ← CalendarTab (CalendarView)
│   ├── squads/
│   │   └── page.tsx        ← GroupsTab (GroupsView + chat)
│   └── profile/
│       └── page.tsx        ← ProfileTab (ProfileView)
├── admin/                  ← stays as-is
├── api/                    ← stays as-is
└── demo/                   ← stays as-is
```

The `(app)` route group lets us wrap all tabs in a shared layout without adding `/app` to URLs.

## Steps

### 1. Extract `usePullToRefresh` hook
Move all pull-to-refresh refs, handlers, and `useLayoutEffect` into `src/hooks/usePullToRefresh.ts`. Returns `{ contentRef, spinnerWrapRef, spinnerRef, handlePullStart, handlePullMove, handlePullEnd }`.

This is a clean standalone extraction — no routing changes yet.

**Files:** new `src/hooks/usePullToRefresh.ts`, edit `src/app/page.tsx`

### 2. Extract `useEvents` hook
Move event-related state + handlers out of page.tsx:
- State: `events`, `setEvents`, `tonightEvents`, `setTonightEvents`, `editingEvent`, `setEditingEvent`, `newlyAddedId`, `addModalOpen`, `addModalDefaultMode`
- Handlers: `handleEditEvent`, `toggleSave`, `toggleDown`, the `onSubmit` logic from AddModal

Similar pattern to existing useChecks/useSquads/useFriends hooks.

**Files:** new `src/hooks/useEvents.ts`, edit `src/app/page.tsx`

### 3. Create `AppContext` + `AppProvider`
Create `src/context/AppContext.tsx` with a React context that holds:

**Auth & identity:**
- `userId`, `profile`, `setProfile`, `isDemoMode`

**Domain hooks (full return values):**
- `eventsHook` (from useEvents — step 2)
- `checksHook` (from useChecks)
- `squadsHook` (from useSquads)
- `friendsHook` (from useFriends)
- `notificationsHook` (from useNotifications)
- `pushHook` (from usePushNotifications)
- `toastHook` (from useToast)

**Shared actions:**
- `loadRealData`
- `showToast`, `showToastWithAction`

**Navigation helpers:**
- `navigateToSquad(squadId)` — pushes to /squads, sets autoSelectSquadId
- `navigateToFeed(checkId?)` — pushes to /feed, optionally highlights a check

`page.tsx` initializes all hooks and wraps children in `<AppProvider value={...}>`. Tabs consume via `useAppContext()`.

**Files:** new `src/context/AppContext.tsx`, edit `src/app/page.tsx`

### 4. Create `(app)/layout.tsx` — shared shell with auth guard
Create `src/app/(app)/layout.tsx` as a `"use client"` layout that:

1. **Runs auth** (via `useAuth`) — shows `<AuthScreen>`, `<ProfileSetupScreen>`, `<EnableNotificationsScreen>`, or `<FirstCheckScreen>` if not fully onboarded
2. **Initializes all hooks** and wraps children in `<AppProvider>`
3. **Calls `loadRealData`** on mount and visibility change
4. **Renders shared chrome:**
   - `<GlobalStyles>`, `<Grain>`
   - `<Header>` (notifications bell, add button)
   - Pull-to-refresh wrapper (wraps `{children}`)
   - `<BottomNav>` (uses `usePathname()` instead of tab state)
   - `<Toast>`, `<SquadNotificationBanner>`, `<IOSInstallBanner>`
   - Overlay modals: `<EditEventModal>`, `<AddModal>`, `<EventLobby>`, `<UserProfileOverlay>`, `<FriendsModal>`, `<NotificationsPanel>`
5. **Handles realtime subscription** (notification channel, service worker messages)
6. **Handles demo mode** (`?demo=true` param)
7. **Handles `?add=` param** (deep link to user profile)

This is the biggest step — it moves ~800 lines out of the old page.tsx.

**Files:** new `src/app/(app)/layout.tsx`, edit `src/app/page.tsx`

### 5. Create tab route pages (one at a time, in order of isolation)
Each tab becomes a `"use client"` page that consumes `useAppContext()`.

**Order** (most isolated → most coupled):

#### 5a. `(app)/page.tsx` — redirect to /feed
```tsx
import { redirect } from "next/navigation";
export default function AppRoot() { redirect("/feed"); }
```

#### 5b. `(app)/calendar/page.tsx` — CalendarTab
Wraps `<CalendarView>`, pulls events + handlers from context. Smallest tab.

#### 5c. `(app)/profile/page.tsx` — ProfileTab
Wraps `<ProfileView>`, pulls profile + push + friends from context.

#### 5d. `(app)/squads/page.tsx` — GroupsTab
Wraps `<GroupsView>`, pulls squads + chat state from context. Needs `setChatOpen` to hide BottomNav (context provides this).

#### 5e. `(app)/feed/page.tsx` — FeedTab
Wraps `<FeedView>` + tonight mode toggle. Most coupled — needs checks, events, friends, feed mode. Also owns `feedMode` and `feedLoaded` state locally.

**Files:** 5 new page files, delete old `src/app/page.tsx`

### 6. Update `BottomNav` to use router
Change `BottomNav` from `onTabChange(tab)` callback to using `usePathname()` + `<Link>`:
- Highlight active tab based on current pathname
- Use `next/link` for navigation (enables client-side transitions)
- Remove `tab` and `onTabChange` props

**Files:** edit `src/components/BottomNav.tsx`, edit `src/app/(app)/layout.tsx`

### 7. Update all `setTab()` calls to `router.push()`
Search for any remaining `setTab` calls across components and replace with `router.push()` or navigation helpers from context:
- Notification click handler → `router.push('/squads')` etc.
- "Squad →" buttons → `navigateToSquad(id)`
- Add modal submit → `router.push('/feed')`
- Service worker message handler → `router.push()`

**Files:** edit `src/app/(app)/layout.tsx`, various components if needed

### 8. Simplify FeedView props
Now that FeedTab consumes context directly, FeedView's prop list (~30 props) can be trimmed. FeedTab handles orchestration, FeedView becomes a pure rendering component.

**Files:** edit `src/components/events/FeedView.tsx`, edit `src/app/(app)/feed/page.tsx`

### 9. Clean up
- Delete the old `src/app/page.tsx` (replaced by route group)
- Remove `Tab` type from `ui-types.ts` if no longer used
- Remove `tab` state and `?tab=` URL param logic
- Verify no dead imports

**Files:** various cleanup edits

## Migration order summary
```
Step 1: usePullToRefresh hook     → standalone extraction, ~60 lines out
Step 2: useEvents hook            → standalone extraction, ~100 lines out
Step 3: AppContext                 → enables tab extraction
Step 4: (app)/layout.tsx          → auth + shell + modals, ~800 lines move
Step 5: 4 tab pages + redirect    → tab rendering moves to route files
Step 6: BottomNav uses router     → real URL-based navigation
Step 7: Replace setTab calls      → all navigation uses router
Step 8: Simplify FeedView props   → cleaner interfaces
Step 9: Clean up                  → remove dead code
```

## Key routing details

**BottomNav mapping:**
| Tab label | Route | Component |
|-----------|-------|-----------|
| ⚡ Feed | `/feed` | FeedTab |
| 📅 Cal | `/calendar` | CalendarTab |
| 👥 Squads | `/squads` | GroupsTab |
| ⚙ You | `/profile` | ProfileTab |

**Client-side navigation:** All tab switches use `next/link` or `router.push()` — no full page reloads. The shared layout persists across navigations (header, nav, modals stay mounted).

**Deep links work:** Users can bookmark `/squads` or share `/feed` directly. The `(app)/layout.tsx` auth guard handles unauthenticated access.

**Back button works:** Browser back/forward navigates between tabs naturally since they're real URLs now.

## Key principles
- **One step at a time** — each step is a standalone commit that doesn't break anything
- **Route group `(app)`** — keeps URLs clean (no `/app` prefix)
- **Context over props** — reduces prop drilling, tabs grab what they need
- **Existing domain hooks unchanged** — useChecks, useSquads, useFriends, useNotifications stay as-is
- **`"use client"` everywhere for now** — server components are a future optimization, not a requirement

## Verification (after each step)
- `npm run build` passes with no errors
- `npm run dev` → all 4 tabs render correctly
- URL changes when switching tabs (`/feed`, `/calendar`, `/squads`, `/profile`)
- Browser back/forward navigates between tabs
- Direct URL access works (e.g. going straight to `/squads`)
- Pull-to-refresh works on feed + squads
- Squad chat opens/closes, messages send
- Event lobby overlay works from feed
- Modals (add event, edit event, friends) open/close
- Toast notifications appear
- Demo mode (`?demo=true`) still works
- Deep link (`?add=username`) still works
