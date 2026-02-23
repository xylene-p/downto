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

## Testing with agent-browser

### Auth
Local Supabase uses magic links. To log in without manual OTP entry:
```bash
SERVICE_ROLE=$(grep SUPABASE_SERVICE_ROLE_KEY .env.development.local | cut -d= -f2-)
LINK=$(curl -s http://127.0.0.1:54321/auth/v1/admin/generate_link \
  -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" \
  -H "Content-Type: application/json" \
  -d '{"type":"magiclink","email":"kat@test.com"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('properties',{}).get('action_link',''))")
npx agent-browser --session-name downto open "$LINK"
```
Use `--session-name downto` on all commands to persist auth across browser restarts.

Test users: `kat@test.com`, `zereptak.burner@gmail.com`

### App navigation
- **Bottom nav tabs**: Feed (`⚡ Feed`), Cal (`📅 Cal`), Squads (`👥 Squads`), You (`⚙ You`)
- **Feed** has two sub-tabs: "For You" (checks + public events) and "Tonight ✶"
- Use `snapshot -i -C` to get cursor-interactive elements (onclick divs like event cards)

### Interest checks (in feed)
- "Down" / "Maybe" buttons to respond, "✓ Down" / "✓ Maybe" to undo
- "Squad →" creates a squad, "💬 Squad →" opens existing squad, "Join Squad →" joins one

### Event cards (in feed)
- "I'm Down ✋" toggles down status, "You're Down ✋" means already down
- "N people down→" (cursor-interactive) opens EventLobby overlay
- "✓ Saved" / "Save" toggles calendar save

### EventLobby (overlay)
- Shows "Who's down?" list
- "I'm looking for a squad" joins crew pool, becomes "Leave squad pool" when joined
- Close by clicking the dark overlay area above the sheet
- Crew pool state resets when un-downing an event (DB trigger)

### Squads tab
- Lists active squads with chat
- Squad chat opens inline with message input
