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

  const { squadId, days = 7 } = await req.json();
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

  // Calculate new expiry
  const { data: squad, error: fetchError } = await supabase
    .from('squads')
    .select('expires_at')
    .eq('id', squadId)
    .single();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const base = squad?.expires_at ? new Date(squad.expires_at) : new Date();
  const newExpiry = new Date(Math.max(base.getTime(), Date.now()) + days * 24 * 60 * 60 * 1000);

  const { error: updateError } = await supabase
    .from('squads')
    .update({ expires_at: newExpiry.toISOString(), warned_at: null })
    .eq('id', squadId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Get display name for system message
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();

  const displayName = profile?.display_name ?? 'Someone';

  // Post system message via admin client (RLS requires sender_id = auth.uid())
  const { getServiceClient } = await import('@/lib/supabase-admin');
  const adminClient = getServiceClient();

  await adminClient
    .from('messages')
    .insert({
      squad_id: squadId,
      sender_id: null,
      text: `${displayName} extended the squad +${days} days`,
      is_system: true,
    });

  return NextResponse.json({ ok: true, expiresAt: newExpiry.toISOString() });
}
