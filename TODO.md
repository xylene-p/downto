# Downto — MVP TODO

## MVP Definition

A user can sign up, add events (via Instagram link or manual entry), see them on their feed, mark themselves as "down," see which friends are also down, post interest checks ("who's down for X tonight?"), form a squad chat from those responses, and message in real time. The app works reliably as a mobile PWA with push notifications so you don't miss when your friend group is making plans. That's shippable.

## Current State

The core loop works end-to-end in production: OTP code auth (8-digit, replaced magic link for PWA compatibility), profile setup onboarding, event creation (IG scraping + Letterboxd + manual), saving events, "I'm down" toggling with friend visibility, interest checks with configurable expiry (1h/4h/12h/24h/open), squad chat formation from both checks and events, real-time messaging via Supabase Realtime, friend requests/acceptance, push notifications, and a polished demo mode. The UI is mobile-first (max-width 420px), has a service worker for push, and deploys to Vercel. There are 20 migrations building out a complete schema with RLS policies. The entire frontend lives in a single ~7,500-line `page.tsx`.

**Event dedup is implemented** — two users pasting the same IG link land on the same event. A social signal badge in PasteModal shows "X people down · Y friends" before save.

**Event lobby + squad formation is implemented** — the old SocialDrawer is now an EventLobby with friends/others grouping, "Start a squad" (pick friends, max 5), and a visible "Looking for a squad" pool where strangers can see each other and form squads using the same selection UI. Squad chats get seeded with context messages and a collapsible logistics card (meeting spot, arrival time, transport notes) pinned between the header and messages.

**Tonight feed works correctly** — public events show with proper saved/down state cross-referenced from user's saved events. Events without venue or date are filtered out.

## MVP Blockers

1. ~~**Profile setup flow after first signup is missing.**~~ **DONE** — `ProfileSetupScreen` exists, gated on `profile.onboarded`.

2. ~~**First-login profile fetch uses a 500ms setTimeout race condition.**~~ **DONE** — inlined Supabase query with 3s timeout + safety timer.

3. ~~**Tonight feed "save" and "I'm down" don't persist.**~~ **DONE** — Tonight events now cross-reference saved events, persist via `db.saveEvent()` / `db.toggleDown()`.

4. ~~**No input validation on event creation.**~~ **DONE** — HTML stripping, length limits, and sanitization on both client and server.

5. ~~**IG scraping fails silently on private posts.**~~ **DONE** — clear error messages explaining why + "Enter manually instead" fallback button.

6. ~~**No error boundaries.**~~ **DONE** — `error.tsx` + `global-error.tsx` catch render errors with styled recovery UI.

7. **UUID-to-number ID collision risk.** Local IDs are generated via `parseInt(uuid.slice(0, 8), 16)` (used ~15 times). This truncates a UUID to 32 bits — collision probability grows fast with more events/users. Two events with the same truncated ID will cause state bugs.

8. **No logout confirmation or session expiry handling.** If the Supabase session expires mid-use, API calls fail silently. Users have to manually reload.

9. ~~**Realtime subscriptions may leak on re-renders.**~~ **DONE** — stale closures fixed via refs for `showToast`, `loadRealData`, `onSquadUpdate`. eslint-disable comments removed.

10. **No rate limiting on API routes.** The `/api/scrape`, `/api/push/subscribe`, and `/api/push/send` endpoints have no rate limiting.

### Blocker triage for push to prod

**All critical blockers resolved.** #1, #2, #3 are done. App is shippable at current scale.

**Can ship with (low risk at current scale):** #7 (UUID collision — negligible at <100 users), #8 (session expiry — rare), #10 (rate limiting — no traffic yet)

**All "should add soon" items resolved.** #4, #5, #9 now done too. Only #7, #8, #10 remain — all low-risk at current scale.

## Remaining

### Not yet implemented
- ~~**IG link on events** — show original Instagram link on saved events so users can tap back to the source post~~ **DONE** — igHandle badge links to original IG post with ↗ indicator
- Dead squad chat nudge (no messages 24h before event → "still going?")
- Friend-saves-event-while-in-pool notification (notify + offer to pull into friend squad)

## Nice to Have (Post-MVP)

- **Break up `page.tsx`** — ~7,500 lines in one component. Extract feed, calendar, groups, profile, modals into separate files.
- **Calendar sync** (Google Calendar / Apple .ics export)
- **Offline support** — service worker only handles push notifications, no caching strategy
- **Optimistic UI updates** — all mutations wait for DB response before updating the UI
- **Infinite scroll / pagination** — all events, checks, and squads are loaded at once
- **Desktop/tablet layout** — currently a centered 420px column
- **Analytics / error tracking** — no Sentry, no Vercel Analytics
- **Image uploads for events** — events rely on Unsplash URLs or IG thumbnails
- **Search / filtering in feed** — no way to filter by date, vibe, or neighborhood
- **Block/report user flow** — friendship has a "blocked" status in the schema but no UI
- **Delete account** — no UI or API for account deletion

## Known Bugs

- **Duplicate numeric IDs possible** — `parseInt(uuid.slice(0, 8), 16)` used for local IDs can collide, causing wrong-event-editing bugs or state corruption.
- ~~**IG scraping broken for private posts**~~ **FIXED** — clear error messages + manual entry fallback.
- ~~**`events.date` stored as null for manually created events**~~ **FIXED** — `parseDateToISO()` parses display strings to ISO dates.
- ~~**Hooks file (`hooks.ts`) is dead code**~~ **FIXED** — deleted.
- ~~**Missing database indexes**~~ **NOT A BUG** — all frequently-queried columns already have indexes from initial migration.
- ~~**eslint-disable on subscription effects**~~ **FIXED** — stale closures fixed via refs, eslint-disable comments removed.
- ~~**Check author can't see squad started by others**~~ **FIXED** — `loadChecks` now preserves `squadLocalId` from previous state; author's check card uses `squadDbId` as fallback.

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
- 19+ database migrations with comprehensive RLS policies
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
