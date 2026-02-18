# Downto — MVP TODO

## MVP Definition

A user can sign up, add events (via Instagram link or manual entry), see them on their feed, mark themselves as "down," see which friends are also down, post interest checks ("who's down for X tonight?"), form a squad chat from those responses, and message in real time. The app works reliably as a mobile PWA with push notifications so you don't miss when your friend group is making plans. That's shippable.

## Current State

The core loop works end-to-end in production: OTP code auth (8-digit, replaced magic link for PWA compatibility), profile setup onboarding, event creation (IG scraping + Letterboxd + manual), saving events, "I'm down" toggling with friend visibility, interest checks with configurable expiry (1h/4h/12h/24h/open) and squad size (2-5), squad chat formation from both checks and events with auto-join on "down" response, real-time messaging via Supabase Realtime, friend requests/acceptance, push notifications, and a polished demo mode. The UI is mobile-first (max-width 420px), has a service worker for push, and deploys to Vercel. There are 21 migrations building out a complete schema with RLS policies.

**All MVP blockers are resolved.** Remaining bugs, enhancements, and tech debt are tracked in [GitHub Issues](https://github.com/xylene-p/downto/issues).

## Completed

- OTP code authentication (8-digit code, replaced magic link — fixes PWA redirect-to-Safari issue)
- Profile auto-creation via DB trigger
- Profile setup onboarding screen (display name, avatar, IG handle, `onboarded` flag)
- First-login retry logic (inlined profile query with 3s timeout + safety timer)
- Event creation from Instagram link scraping (public posts)
- Event creation from Letterboxd link scraping
- Manual event creation (idea mode in paste modal)
- Event saving and "I'm down" toggling (for saved events)
- Tonight feed save/down persistence (cross-references saved events, filters incomplete events)
- Event editing (long-press + pencil icon on owned events)
- Event dedup by Instagram URL (canonical igUrl, findEventByIgUrl, partial index)
- Social signal in PasteModal ("X people down · Y friends" badge on duplicate IG link)
- Event lobby (replaced SocialDrawer) — friends/others grouping, inline member selection
- "Start a squad" from event lobby — pick friends who are down, creates event-linked squad
- Visible squad pool — strangers opt in to "Looking for a squad" list, select each other to form squads
- Logistics card in squad chat — collapsible, shows for all squads, hides for past events
- Friend requests, acceptance, and unfriending
- Real-time friend request notifications
- Interest checks with configurable expiry (1h / 4h / 12h / 24h / open)
- Check responses (down / maybe / nah)
- Squad chat creation from interest checks
- Squad chat creation from events
- Late joiner support for squad chats
- Real-time messaging in squads (Supabase Realtime)
- Push notifications (Web Push via VAPID) for friend requests, squad messages, check responses
- Service worker with notification click routing
- Tonight feed (public events with correct saved state)
- Notification panel with mark-as-read
- User search for adding friends
- Profile editing (display name, avatar letter, IG handle, availability status)
- Demo mode with full mock data
- PWA manifest and icons
- 21 database migrations with comprehensive RLS policies
- Vercel deployment pipeline
- Share publicly toggle on event creation
- Crew → squad terminology rename throughout UI
- Error boundaries (`error.tsx` + `global-error.tsx`) with styled recovery page
- Clear error messages for private/restricted IG posts with manual entry fallback
- Leave squad (self-removal from squad chat with confirmation modal, RLS-enforced — no kick)
- Auto-remove from crew pool on squad join (DB trigger prevents duplicate squad invitations from stale pool state)
- Compact squad chat layout (grouped messages, inline header with avatars)
- Avatar letter fix — "You" uses actual profile letter, not hardcoded "Y"
- Input validation — HTML stripping, length limits, sanitization on client + server
- events.date ISO parsing — manual/scraped events now populate the ISO date column
- Subscription stale closure fixes — refs for showToast, loadRealData, onSquadUpdate
- Deleted dead hooks.ts
- Removed fake "Connect Instagram" flow — IG handle is just a profile field for identity verification
- Natural language date parsing on interest checks — Todoist-style detection (tonight, tomorrow, friday, feb 20, etc.) with auto-detected date chip and dismissible UI
- IG link on events — igHandle badge on event cards links to original Instagram post (↗ opens in new tab)
- Reusable UserProfileOverlay — tappable avatars/names in squad chats, event lobbies, and friends list open a centered profile card with name, avatar, @username, IG handle, availability, and contextual friend actions (add/remove/accept/pending)
- Auto-join squad from interest check — DB trigger adds "down" responders to existing squad if room; configurable max squad size (2-5) with pill picker in check creation UI; check cards show squad capacity (X/Y) and "Squad full" when at cap
- UUID-to-string ID migration — all interfaces use full UUID strings, removed `dbId`/`odbc` indirection, eliminated `parseInt(uuid.slice(0,8), 16)` collision risk
- Concurrent loadRealData guard — `isLoadingRef` prevents overlapping data loads from tab switches, visibility changes, and realtime callbacks
- Removed `tab` from loadRealData useEffect deps — added `visibilitychange` listener instead to avoid full reload on every tab switch
- Fixed `profile!` non-null assertions — replaced 3 remaining crash-prone `profile!` with `profile?.` and fallback
- Optimistic rollback on toggleSave/toggleDown — DB failures now revert the UI and show a toast instead of silently desyncing
