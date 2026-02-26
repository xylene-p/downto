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

  const { squadId, date, time, clear } = await req.json();
  if (!squadId) {
    return NextResponse.json({ error: 'squadId required' }, { status: 400 });
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

  const { getServiceClient } = await import('@/lib/supabase-admin');
  const adminClient = getServiceClient();

  // Get user's display name for the system message
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();

  const displayName = profile?.display_name ?? 'Someone';

  // Get squad's linked check_id
  const { data: squad } = await supabase
    .from('squads')
    .select('check_id')
    .eq('id', squadId)
    .single();

  // --- Clear date/time ---
  if (clear) {
    // Only the check creator can clear
    if (squad?.check_id) {
      const { data: check } = await supabase
        .from('interest_checks')
        .select('author_id')
        .eq('id', squad.check_id)
        .single();

      if (check?.author_id !== user.id) {
        return NextResponse.json({ error: 'Only the check creator can clear the date' }, { status: 403 });
      }

      await adminClient
        .from('interest_checks')
        .update({ event_date: null, event_time: null })
        .eq('id', squad.check_id);
    }

    await supabase
      .from('squads')
      .update({ locked_date: null })
      .eq('id', squadId);

    await adminClient
      .from('messages')
      .insert({
        squad_id: squadId,
        sender_id: null,
        text: `${displayName} cleared the date`,
        is_system: true,
      });

    return NextResponse.json({ ok: true, cleared: true });
  }

  // --- Set date/time ---
  if (!date) {
    return NextResponse.json({ error: 'date required' }, { status: 400 });
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

  // Sync date/time back to the linked interest check
  if (squad?.check_id) {
    await adminClient
      .from('interest_checks')
      .update({
        event_date: date,
        ...(time !== undefined ? { event_time: time } : {}),
      })
      .eq('id', squad.check_id);
  }

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const timeLabel = time ? ` at ${time}` : '';

  // Insert system message
  await adminClient
    .from('messages')
    .insert({
      squad_id: squadId,
      sender_id: null,
      text: `${displayName} locked in ${dateLabel}${timeLabel}`,
      is_system: true,
    });

  return NextResponse.json({ ok: true, expires_at: expiresAt.toISOString() });
}
