# Downto — MVP TODO

## MVP Definition

A user can sign up, add events (via Instagram link or manual entry), see them on their feed, mark themselves as "down," see which friends are also down, post interest checks ("who's down for X tonight?"), form a squad chat from those responses, and message in real time. The app works reliably as a mobile PWA with push notifications so you don't miss when your friend group is making plans. That's shippable.

## Current State

The core loop works end-to-end in production: magic-link auth, profile setup onboarding, event creation (IG scraping + Letterboxd + manual), saving events, "I'm down" toggling with friend visibility, interest checks with 24h expiry, squad chat formation from both checks and events, real-time messaging via Supabase Realtime, friend requests/acceptance, push notifications, and a polished demo mode. The UI is mobile-first (max-width 420px), has a service worker for push, and deploys to Vercel. There are 13 migrations building out a complete schema with RLS policies. The entire frontend lives in a single 7,200-line `page.tsx`.

**Event dedup is implemented** — two users pasting the same IG link land on the same event. A social signal badge in PasteModal shows "X people down · Y friends" before save.

**Event lobby + squad formation is implemented** — the old SocialDrawer is now an EventLobby with friends/others grouping, "Start a squad" (pick friends, max 5), and "Find a crew" (stranger pool with auto-formation at 4+). Squad chats get seeded with context messages and a persistent logistics card (meeting spot, arrival time, transport notes) pinned between the header and messages.

## MVP Blockers

1. ~~**Profile setup flow after first signup is missing.**~~ **DONE** — `ProfileSetupScreen` exists, gated on `profile.onboarded`.

2. ~~**First-login profile fetch uses a 500ms setTimeout race condition.**~~ **DONE** — retry logic with 5 attempts for new sign-ins.

3. **Tonight feed "save" and "I'm down" don't persist.** Toggling save/down on Tonight events only updates local state — doesn't call `db.saveEvent()` or `db.toggleDown()`. The Save button at `page.tsx:6402` only does `setTonightEvents`. Refreshing the page loses the state.

4. **No input validation on event creation.** The paste modal accepts any string. Empty titles, nonsensical dates, XSS payloads — nothing is validated client-side or server-side before hitting the database.

5. **IG scraping fails silently on private posts.** The `/api/scrape` route gets a 403 from Instagram's oEmbed API for private posts and returns a generic error. Users don't get clear feedback about why their link didn't work or what to do instead.

6. **No error boundaries.** Any uncaught render error in the 7,200-line component crashes the entire app with a white screen. There's no recovery path.

7. **UUID-to-number ID collision risk.** Local IDs are generated via `parseInt(uuid.slice(0, 8), 16)` (used ~15 times). This truncates a UUID to 32 bits — collision probability grows fast with more events/users. Two events with the same truncated ID will cause state bugs.

8. **No logout confirmation or session expiry handling.** If the Supabase session expires mid-use, API calls fail silently. Users have to manually reload.

9. **Realtime subscriptions may leak on re-renders.** `useEffect` dependency arrays are incomplete for realtime subscriptions, suppressed with `eslint-disable-line`. Tab switches trigger `loadRealData` re-runs but subscriptions may stack.

10. **No rate limiting on API routes.** The `/api/scrape`, `/api/push/subscribe`, and `/api/push/send` endpoints have no rate limiting.

### Blocker triage for push to prod

**Must fix before push:** #3 (tonight save doesn't persist — users will lose saves on refresh, core broken UX)

**Can ship with (low risk at current scale):** #4 (validation — scrape API constrains most input), #5 (private posts — error shows, just not helpful), #7 (UUID collision — negligible at <100 users), #8 (session expiry — rare), #9 (subscription leaks — minor memory), #10 (rate limiting — no traffic yet)

**Should add soon:** #6 (error boundary — one bad render crashes everything)

## Remaining: Event Lobby Polish

Event lobby + squad formation is implemented. What's left:

### Not yet implemented
- Dead crew chat nudge (no messages 24h before event → "still going?")
- Friend-saves-event-while-in-pool notification (notify + offer to pull into friend squad)
- Logistics card auto-hide after event date passes (needs ISO date parsing, currently shows for all event-linked squads)

## Nice to Have (Post-MVP)

- **Break up `page.tsx`** — 7,200 lines in one component. Extract feed, calendar, groups, profile, modals into separate files.
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

- **Tonight feed save/down state doesn't persist** — toggling save or "I'm down" on Tonight events only updates local React state, not the database. Refresh loses the state. (`page.tsx:6402`)
- **Duplicate numeric IDs possible** — `parseInt(uuid.slice(0, 8), 16)` used for local IDs can collide, causing wrong-event-editing bugs or state corruption.
- **IG scraping broken for private posts** — returns a generic error with no user-facing explanation or fallback to manual entry.
- **`events.date` stored as null for manually created events** — the `date` column (ISO date) is never populated from manual entry, only `date_display` (human string) is set. Calendar view or date-based queries won't work properly.
- **Hooks file (`hooks.ts`) is dead code** — a full set of hooks was written but `page.tsx` does all the same work inline. The two will drift.
- **Missing database indexes** — no indexes on `notifications.user_id`, `saved_events.user_id`, `friendships.requester_id/addressee_id`, or other frequently queried columns.
- **eslint-disable on subscription effects** — `useEffect` dependency arrays are incomplete for realtime subscriptions, suppressed with `eslint-disable-line`.

## Completed

- Magic-link email authentication (Supabase Auth)
- Profile auto-creation via DB trigger
- Profile setup onboarding screen (display name, avatar, IG handle, `onboarded` flag)
- First-login retry logic (5 attempts with 500ms delay for new sign-ins)
- Event creation from Instagram link scraping (public posts)
- Event creation from Letterboxd link scraping
- Manual event creation (idea mode in paste modal)
- Event saving and "I'm down" toggling (for saved events)
- Event editing (long-press + pencil icon on owned events)
- Event dedup by Instagram URL (canonical igUrl, findEventByIgUrl, partial index)
- Social signal in PasteModal ("X people down · Y friends" badge on duplicate IG link)
- Event lobby (replaced SocialDrawer) — friends/others grouping, inline member selection
- "Start a squad" from event lobby — pick friends who are down, creates event-linked squad
- "Find a crew" stranger matching — crew pool table, auto-forms squad at 4+, mutual friend priority
- Logistics card in squad chat — pinned editable card (meeting spot, arrival time, transport notes)
- Friend requests, acceptance, and unfriending
- Real-time friend request notifications
- Interest checks with 24h expiry countdown
- Check responses (down / maybe / nah)
- Squad chat creation from interest checks
- Squad chat creation from events
- Late joiner support for squad chats
- Real-time messaging in squads (Supabase Realtime)
- Push notifications (Web Push via VAPID) for friend requests, squad messages, check responses
- Service worker with notification click routing
- Tonight feed (public events)
- Notification panel with mark-as-read
- User search for adding friends
- Profile editing (display name, avatar letter, IG handle, availability status)
- Demo mode with full mock data
- PWA manifest and icons
- 13 database migrations with comprehensive RLS policies
- Vercel deployment pipeline
- Share publicly toggle on event creation
