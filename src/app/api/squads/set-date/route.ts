import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Use the user's auth token for RLS
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { squadId, date } = await req.json();
  if (!squadId || !date) {
    return NextResponse.json({ error: 'squadId and date required' }, { status: 400 });
  }

  // Verify user is a squad member
  const { data: membership } = await supabase
    .from('squad_members')
    .select('id')
    .eq('squad_id', squadId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Not a squad member' }, { status: 403 });
  }

  // Update expires_at to date + 24h
  const expiresAt = new Date(date + 'T23:59:59Z');
  expiresAt.setHours(expiresAt.getHours() + 24);

  const { error: updateError } = await supabase
    .from('squads')
    .update({ expires_at: expiresAt.toISOString(), locked_date: date })
    .eq('id', squadId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Get user's display name for the system message
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  // Insert system message — use service-role client to bypass sender_id RLS
  const { getServiceClient } = await import('@/lib/supabase-admin');
  const adminClient = getServiceClient();

  await adminClient
    .from('messages')
    .insert({
      squad_id: squadId,
      sender_id: null,
      text: `${profile?.display_name ?? 'Someone'} locked in ${dateLabel}`,
      is_system: true,
    });

  return NextResponse.json({ ok: true, expires_at: expiresAt.toISOString() });
}
