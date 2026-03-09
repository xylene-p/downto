import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

const KICK_MESSAGES = [
  "{name} has been voted off the island",
  "{name} got the boot 🥾",
  "{name} has left the chat (involuntarily)",
  "{name} was yeeted from the squad",
  "{name} didn't survive the rose ceremony 🌹",
  "{name} has been benched",
  "{name} got hit with the 'we need to talk'",
  "{name} was ghosted irl",
  "{name} just got unfriended in 4k",
  "{name} was eliminated. 9 players remain.",
];

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const { squadId, userId: targetUserId } = await req.json();
  if (!squadId || !targetUserId) {
    return NextResponse.json({ error: 'squadId and userId required' }, { status: 400 });
  }

  if (targetUserId === user.id) {
    return NextResponse.json({ error: "Can't kick yourself (use leave instead)" }, { status: 400 });
  }

  // Verify caller is an active squad member
  const { data: callerMembership } = await supabase
    .from('squad_members')
    .select('id, role')
    .eq('squad_id', squadId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!callerMembership || callerMembership.role === 'waitlist') {
    return NextResponse.json({ error: 'Not an active squad member' }, { status: 403 });
  }

  const { getServiceClient } = await import('@/lib/supabase-admin');
  const adminClient = getServiceClient();

  // Verify target is in the squad
  const { data: targetMembership } = await adminClient
    .from('squad_members')
    .select('id')
    .eq('squad_id', squadId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (!targetMembership) {
    return NextResponse.json({ error: 'Target is not in this squad' }, { status: 400 });
  }

  // Remove them
  const { error: deleteError } = await adminClient
    .from('squad_members')
    .delete()
    .eq('squad_id', squadId)
    .eq('user_id', targetUserId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Get target user's display name
  const { data: targetProfile } = await adminClient
    .from('profiles')
    .select('display_name')
    .eq('id', targetUserId)
    .single();

  const targetName = targetProfile?.display_name ?? 'Someone';
  const msg = KICK_MESSAGES[Math.floor(Math.random() * KICK_MESSAGES.length)].replace('{name}', targetName);

  await adminClient
    .from('messages')
    .insert({
      squad_id: squadId,
      sender_id: null,
      text: msg,
      is_system: true,
    });

  return NextResponse.json({ ok: true });
}
