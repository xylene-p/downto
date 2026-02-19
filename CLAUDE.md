# down to

Event saving app with social layer. Save events from Instagram to your calendar, see who else is going, form small squads.

## Stack
- Next.js (App Router)
- TypeScript
- Supabase (auth, Postgres, RLS, Realtime, DB triggers)
- No CSS framework — inline styles, Space Mono + Instrument Serif fonts, dark theme with #E8FF5A accent

## Development
- `npm run dev` — local Supabase (`127.0.0.1:54321` via `.env.development.local`)
- `npm run dev:prod` — cloud Supabase (`.env.local`, for testing with real data)
- Production env vars are set in Vercel

## Workflow
- Bugs and feature requests are tracked in [GitHub Issues](https://github.com/xylene-p/downto/issues).
- Work on the next highest priority issue unless I say otherwise.
