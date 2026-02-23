#!/bin/bash
# Quick local login — bypasses OTP by generating a magic link via admin API
# Usage: ./scripts/local-login.sh [email]
# Default: kat@test.com

EMAIL="${1:-kat@test.com}"
SERVICE_ROLE=$(grep SUPABASE_SERVICE_ROLE_KEY .env.development.local | cut -d= -f2-)

LINK=$(curl -s http://127.0.0.1:54321/auth/v1/admin/generate_link \
  -H "apikey: $SERVICE_ROLE" \
  -H "Authorization: Bearer $SERVICE_ROLE" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"magiclink\",\"email\":\"$EMAIL\"}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('action_link','') or d.get('properties',{}).get('action_link',''))")

if [ -z "$LINK" ]; then
  echo "Failed to generate link for $EMAIL"
  exit 1
fi

echo "Opening $EMAIL..."
open "$LINK"
