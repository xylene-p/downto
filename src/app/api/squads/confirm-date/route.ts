import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

  const { squadId, response } = await req.json();
  if (!squadId || !['yes', 'no'].includes(response)) {
    return NextResponse.json({ error: 'squadId and response (yes/no) required' }, { status: 400 });
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

  // Get user's display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  const displayName = profile?.display_name ?? 'Someone';

  // Update confirm row
  const { error: confirmError } = await adminClient
    .from('squad_date_confirms')
    .update({ response, responded_at: new Date().toISOString() })
    .eq('squad_id', squadId)
    .eq('user_id', user.id);

  if (confirmError) {
    return NextResponse.json({ error: confirmError.message }, { status: 500 });
  }

  if (response === 'yes') {
    // System message
    await adminClient
      .from('messages')
      .insert({
        squad_id: squadId,
        sender_id: null,
        text: `${displayName} is still down`,
        is_system: true,
      });

    // Check if all members confirmed — auto-lock the date
    await checkAndAutoLock(adminClient, squadId);

    return NextResponse.json({ ok: true });
  }

  // --- "no" flow ---

  // System message
  await adminClient
    .from('messages')
    .insert({
      squad_id: squadId,
      sender_id: null,
      text: `${displayName} can't make it`,
      is_system: true,
    });

  // Remove from squad
  await adminClient
    .from('squad_members')
    .delete()
    .eq('squad_id', squadId)
    .eq('user_id', user.id);

  // Keep confirm row with response='no' so promote_from_waitlist can exclude this user

  // Promote from waitlist if squad has a linked check
  const { data: squad } = await adminClient
    .from('squads')
    .select('check_id')
    .eq('id', squadId)
    .single();

  if (squad?.check_id) {
    // Get the date_confirm message id for the promoted user's confirm row
    const { data: confirmMsg } = await adminClient
      .from('messages')
      .select('id')
      .eq('squad_id', squadId)
      .eq('message_type', 'date_confirm')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (confirmMsg) {
      await adminClient.rpc('promote_from_waitlist', {
        p_squad_id: squadId,
        p_check_id: squad.check_id,
        p_confirm_message_id: confirmMsg.id,
      });
    }
  }

  // Check if remaining members are all confirmed
  await checkAndAutoLock(adminClient, squadId);

  return NextResponse.json({ ok: true, removed: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkAndAutoLock(adminClient: any, squadId: string) {
  // Get current squad member IDs
  const { data: members } = await adminClient
    .from('squad_members')
    .select('user_id')
    .eq('squad_id', squadId);

  const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
  if (memberIds.length === 0) return;

  // Get confirms for current members only (excludes removed members)
  const { data: confirms } = await adminClient
    .from('squad_date_confirms')
    .select('user_id, response')
    .eq('squad_id', squadId)
    .in('user_id', memberIds);

  if (!confirms || confirms.length === 0) return;

  const allResponded = confirms.every((c: { response: string | null }) => c.response !== null);
  const allYes = allResponded && confirms.every((c: { response: string }) => c.response === 'yes');

  if (allYes) {
    await adminClient
      .from('squads')
      .update({ date_status: 'locked' })
      .eq('id', squadId);

    await adminClient
      .from('messages')
      .insert({
        squad_id: squadId,
        sender_id: null,
        text: 'Everyone\'s in — date is set!',
        is_system: true,
      });
  }
}
