import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const webhookSecret = process.env.PUSH_WEBHOOK_SECRET!;

webpush.setVapidDetails(
  'mailto:push@downto.xyz',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

function getServiceClient() {
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(request: NextRequest) {
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

  const supabase = getServiceClient();

  // Get all push subscriptions for this user
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', notification.user_id);

  if (error || !subscriptions?.length) {
    return NextResponse.json({ sent: 0 });
  }

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body || '',
    type: notification.type,
    relatedId: notification.related_squad_id || notification.related_check_id || notification.related_user_id,
  });

  const staleEndpoints: string[] = [];
  let sent = 0;

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        );
        sent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(sub.endpoint);
        }
      }
    })
  );

  // Clean up stale subscriptions
  if (staleEndpoints.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', notification.user_id)
      .in('endpoint', staleEndpoints);
  }

  return NextResponse.json({ sent, cleaned: staleEndpoints.length });
}
