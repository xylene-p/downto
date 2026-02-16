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
  console.log('[push/send] secret match:', secret === webhookSecret, 'secret present:', !!secret);
  if (secret !== webhookSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  console.log('[push/send] webhook body:', JSON.stringify(body));

  // Supabase webhook sends { type, table, record, ... }
  const notification = body.record;
  if (!notification?.user_id) {
    console.log('[push/send] no user_id in payload');
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const supabase = getServiceClient();

  // Get all push subscriptions for this user
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', notification.user_id);

  console.log('[push/send] subscriptions:', subscriptions?.length, 'error:', error?.message);

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
        console.log('[push/send] sent to', sub.endpoint.slice(0, 50));
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        console.log('[push/send] error sending:', statusCode, (err as Error).message);
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

  console.log('[push/send] result:', { sent, cleaned: staleEndpoints.length });
  return NextResponse.json({ sent, cleaned: staleEndpoints.length });
}
