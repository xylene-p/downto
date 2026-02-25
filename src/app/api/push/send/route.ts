import { NextRequest, NextResponse } from 'next/server';
import { ensureVapid, sendPushToUser } from '@/lib/push';

export const runtime = 'nodejs';

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

  const sent = await sendPushToUser(notification);
  return NextResponse.json({ sent });
}
