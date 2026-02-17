# Downto — MVP TODO

## MVP Definition

A user can sign up, add events (via Instagram link or manual entry), see them on their feed, mark themselves as "down," see which friends are also down, post interest checks ("who's down for X tonight?"), form a squad chat from those responses, and message in real time. The app works reliably as a mobile PWA with push notifications so you don't miss when your friend group is making plans. That's shippable.

## Current State

The core loop works end-to-end in production: magic-link auth, event creation (IG scraping + manual), saving events, "I'm down" toggling with friend visibility, interest checks with 24h expiry, squad chat formation from check responses, real-time messaging via Supabase Realtime, friend requests/acceptance, push notifications, and a polished demo mode. The UI is mobile-first (max-width 420px), has a service worker for push, and deploys to Vercel. There are 10 migrations building out a complete schema with RLS policies. The entire frontend lives in a single 6,500-line `page.tsx`.

## MVP Blockers

1. **Profile setup flow after first signup is missing.** New users get a username auto-generated from their email prefix. There's no onboarding screen to set display name, avatar, or IG handle — users land directly on the feed with defaults.

2. **First-login profile fetch uses a 500ms setTimeout race condition.** After magic-link sign-in, the app waits 500ms hoping the DB trigger (`handle_new_user`) finishes creating the profile row. If it doesn't, the profile fetch fails silently and the user sees a broken state. Needs retry logic or a poll-until-ready approach (`page.tsx:4094`, `hooks.ts:48`).

3. **Tonight feed "save" and "I'm down" don't persist.** Toggling save/down on Tonight events only updates local state — doesn't call `db.saveEvent()` or `db.toggleDown()`. Refreshing the page loses the state. The `handleToggleSave` and `handleToggleDown` functions treat tonight events differently from saved events but the DB path isn't wired up.

4. **No input validation on event creation.** The paste modal accepts any string. Empty titles, nonsensical dates, XSS payloads — nothing is validated client-side or server-side before hitting the database.

5. **IG scraping fails silently on private posts.** The `/api/scrape` route gets a 403 from Instagram's oEmbed API for private posts and returns a generic error. Users don't get clear feedback about why their link didn't work or what to do instead.

6. **No error boundaries.** Any uncaught render error in the 6,500-line component crashes the entire app with a white screen. There's no recovery path.

7. **UUID-to-number ID collision risk.** Local IDs are generated via `parseInt(uuid.slice(0, 8), 16)` (used 13 times). This truncates a UUID to 32 bits — collision probability grows fast with more events/users. Two events with the same truncated ID will cause state bugs (wrong event edited, wrong card updated).

8. **No logout confirmation or session expiry handling.** If the Supabase session expires mid-use, API calls fail silently. No refresh token rotation visible in the code. Users have to manually reload.

9. **Realtime subscriptions may leak on re-renders.** The notification/friendship/check-response subscription `useEffect` blocks have dependency arrays that don't include all referenced callbacks (e.g., `loadRealData`), with eslint-disable comments suppressing the warning (`page.tsx:4511`). Tab switches trigger `loadRealData` re-runs but subscriptions may stack.

10. **No rate limiting on API routes.** The `/api/scrape`, `/api/push/subscribe`, and `/api/push/send` endpoints have no rate limiting. Scraping in particular could get the server IP blocked by Instagram.

## Nice to Have (Post-MVP)

- **Break up `page.tsx`** — 6,500 lines in one component. Extract feed, calendar, groups, profile, modals into separate files. The hooks in `hooks.ts` were started but aren't used by the main page.
- **Calendar sync** (Google Calendar / Apple .ics export) — mentioned in CLAUDE.md as "next up," not started.
- **Offline support** — service worker only handles push notifications, no caching strategy. App is unusable without internet.
- **Optimistic UI updates** — all mutations wait for DB response before updating the UI. Feels sluggish on slow connections.
- **Infinite scroll / pagination** — all events, checks, and squads are loaded at once. Will degrade as data grows.
- **Desktop/tablet layout** — currently a centered 420px column with no adaptation for larger screens.
- **Analytics / error tracking** — no Sentry, no Vercel Analytics, no way to know if things are breaking in production.
- **Image uploads for events** — events rely on Unsplash URLs or IG thumbnails. No user photo upload.
- **Search / filtering in feed** — no way to filter events by date, vibe, or neighborhood.
- **Block/report user flow** — friendship has a "blocked" status in the schema but no UI to trigger it.
- **Delete account** — no UI or API for account deletion.
- **Landscape mode** — no optimization, app looks awkward in landscape.

## Known Bugs

- **Tonight feed save/down state doesn't persist** — toggling save or "I'm down" on Tonight events only updates local React state, not the database. Refresh loses the state.
- **Profile creation race condition** — 500ms `setTimeout` before fetching profile on first signup can fail if the `handle_new_user` trigger hasn't completed. No retry.
- **Duplicate numeric IDs possible** — `parseInt(uuid.slice(0, 8), 16)` used for local IDs can collide, causing wrong-event-editing bugs or state corruption.
- **IG scraping broken for private posts** — returns a generic error with no user-facing explanation or fallback to manual entry.
- **`events.date` stored as null for manually created events** — the `date` column (ISO date) is never populated from manual entry (`page.tsx:6014`), only `date_display` (human string) is set. Calendar view or date-based queries won't work properly.
- **Hooks file (`hooks.ts`) is dead code** — a full set of hooks was written (useAuth, useEvents, useInterestChecks, useSquads, useFriends) but `page.tsx` does all the same work inline. The two will drift.
- **Missing database indexes** — no indexes on `notifications.user_id`, `saved_events.user_id`, `friendships.requester_id/addressee_id`, or other frequently queried columns. Will slow down as user count grows.
- **eslint-disable on subscription effects** — `useEffect` dependency arrays are incomplete for realtime subscriptions, suppressed with `eslint-disable-line`. Potential for stale closures or subscription leaks.

## Completed

- Magic-link email authentication (Supabase Auth)
- Profile auto-creation via DB trigger
- Event creation from Instagram link scraping (public posts)
- Event creation from Letterboxd link scraping
- Manual event creation (idea mode in paste modal)
- Event saving and "I'm down" toggling (for saved events)
- Event editing (long-press + pencil icon on owned events)
- Social drawer showing who's down (friend visibility via RLS)
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
- 10 database migrations with comprehensive RLS policies
- Vercel deployment pipeline
- Share publicly toggle on event creation
