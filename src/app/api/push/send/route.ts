import { NextRequest, NextResponse } from 'next/server';
import { ensureVapid, sendPushToUser } from '@/lib/push';

export const runtime = 'nodejs';

// Dedup: Supabase webhooks can double-fire for the same notification row.
// Track recently processed notification IDs in memory (TTL 60s).
const recentlySent = new Map<string, number>();

function dedup(notificationId: string): boolean {
  const now = Date.now();
  // Evict stale entries
  for (const [id, ts] of recentlySent) {
    if (now - ts > 60_000) recentlySent.delete(id);
  }
  if (recentlySent.has(notificationId)) return true;
  recentlySent.set(notificationId, now);
  return false;
}

export async function POST(request: NextRequest) {
  if (!ensureVapid()) {
    return NextResponse.json({ error: 'Push not configured' }, { status: 503 });
  }

  const webhookSecret = process.env.PUSH_WEBHOOK_SECRET;
  // Validate Supabase webhook secret (sent in x-supabase-webhook-secret header)
  const secret = request.headers.get('x-supabase-webhook-secret');
  if (secret !== webhookSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  // Supabase webhook sends { type, table, record, ... }
  const notification = body.record;
  if (!notification?.user_id) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Skip if we already processed this notification (webhook double-fire)
  if (notification.id && dedup(notification.id)) {
    return NextResponse.json({ sent: 0, deduped: true });
  }

  const sent = await sendPushToUser(notification);
  return NextResponse.json({ sent });
}
