import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase-admin';
import { ensureVapid, sendPushToUser } from '@/lib/push';

export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: NextRequest) {
  if (!ensureVapid()) {
    return NextResponse.json({ error: 'Push not configured' }, { status: 503 });
  }

  // Authenticate caller
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { checkId, squadId, messageTimestamp } = await request.json();
  const supabase = getServiceClient();
  let notifications: Record<string, unknown>[] | null = null;

  if (checkId) {
    // Fetch friend_check notifications created by the DB trigger
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('related_check_id', checkId)
      .eq('type', 'friend_check');
    notifications = data;
  } else if (squadId) {
    // Fetch squad_message notifications created after the message was sent
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('related_squad_id', squadId)
      .eq('type', 'squad_message');
    if (messageTimestamp) {
      query = query.gte('created_at', messageTimestamp);
    }
    const { data } = await query;
    notifications = data;
  } else {
    return NextResponse.json({ error: 'Missing checkId or squadId' }, { status: 400 });
  }

  if (!notifications?.length) {
    return NextResponse.json({ sent: 0 });
  }

  let totalSent = 0;
  await Promise.allSettled(
    notifications.map(async (n) => {
      totalSent += await sendPushToUser(n as unknown as Parameters<typeof sendPushToUser>[0]);
    })
  );

  return NextResponse.json({ sent: totalSent });
}
