'use server';

import { createClient } from '@/lib/supabase/server';
import { formatDistanceToNow } from 'date-fns';
import type { Squad } from '../types';

export async function getSquads(): Promise<Squad[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Get squad IDs the user is a member of
  const { data: memberOf, error: memberError } = await supabase
    .from('squad_members')
    .select('squad_id')
    .eq('user_id', user.id);

  if (memberError) throw memberError;
  if (!memberOf || memberOf.length === 0) return [];

  const squadIds = memberOf.map((m) => m.squad_id);

  const { data, error } = await supabase
    .from('squads')
    .select(
      `
      *,
      event:events(title, date_display, date),
      check:interest_checks(author_id, event_time, date_flexible, time_flexible, max_squad_size),
      members:squad_members(*, user:profiles!user_id(*)),
      messages(*, sender:profiles!sender_id(*))
    `
    )
    .in('id', squadIds)
    .is('archived_at', null)
    .or(`expires_at.gt.${new Date().toISOString()},expires_at.is.null`)
    .order('created_at', { ascending: false })
    .order('created_at', {
      ascending: true,
      referencedTable: 'messages',
    });

  if (error) throw error;

  const userId = user.id;

  const squads: Squad[] = (data ?? []).map((s: any) => {
    const myMembership = (s.members ?? []).find(
      (m: any) => m.user_id === userId
    );
    const isWaitlisted = myMembership?.role === 'waitlist';

    const members = (s.members ?? [])
      .filter((m: any) => m.role !== 'waitlist')
      .map((m: any) => ({
        name:
          m.user_id === userId
            ? 'You'
            : m.user?.display_name ?? 'Unknown',
        avatar:
          m.user?.avatar_letter ??
          m.user?.display_name?.charAt(0)?.toUpperCase() ??
          '?',
        userId: m.user_id,
        role: m.role,
      }));

    const waitlistedMembers = (s.members ?? [])
      .filter((m: any) => m.role === 'waitlist' && m.user_id !== userId)
      .map((m: any) => ({
        name: m.user?.display_name ?? 'Unknown',
        avatar:
          m.user?.avatar_letter ??
          m.user?.display_name?.charAt(0)?.toUpperCase() ??
          '?',
        userId: m.user_id,
        role: m.role,
      }));

    const sortedRaw = (s.messages ?? []).sort(
      (a: any, b: any) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const messages = sortedRaw.map((msg: any) => ({
      sender: msg.is_system
        ? 'system'
        : msg.sender_id === userId
          ? 'You'
          : msg.sender?.display_name ?? 'Unknown',
      text: msg.text,
      time: formatDistanceToNow(new Date(msg.created_at), {
        addSuffix: false,
      }),
      isYou: msg.sender_id === userId,
      ...(msg.message_type === 'date_confirm'
        ? { messageType: 'date_confirm' as const, messageId: msg.id }
        : {}),
      ...(msg.message_type === 'poll'
        ? { messageType: 'poll' as const, messageId: msg.id }
        : {}),
    }));

    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const lastRawMessage = sortedRaw.length > 0 ? sortedRaw[sortedRaw.length - 1] : null;

    return {
      id: s.id,
      name: s.name,
      checkId: s.check_id ?? undefined,
      eventId: s.event_id ?? undefined,
      eventTitle: s.event?.title ?? undefined,
      eventDate: s.event?.date_display ?? undefined,
      eventTime: ((s.check as any)?.event_time as string | undefined)?.replace(/\s*(AM)/gi, 'am').replace(/\s*(PM)/gi, 'pm') ?? undefined,
      dateStatus:
        s.date_status === 'proposed' || s.date_status === 'locked'
          ? s.date_status
          : undefined,
      lockedDate: s.locked_date ?? undefined,
      maxSquadSize: (s.check as any)?.max_squad_size ?? undefined,
      members,
      waitlistedMembers:
        waitlistedMembers.length > 0 ? waitlistedMembers : undefined,
      messages,
      lastMsg: lastMessage
        ? lastMessage.sender === 'system'
          ? lastMessage.text
          : `${lastMessage.sender}: ${lastMessage.text}`
        : '',
      time: lastMessage
        ? lastMessage.time
        : formatDistanceToNow(new Date(s.created_at), { addSuffix: false }),
      expiresAt: s.expires_at ?? undefined,
      graceStartedAt: s.grace_started_at ?? undefined,
      isWaitlisted,
      lastActivityAt: lastRawMessage?.created_at ?? s.created_at,
    };
  });

  squads.sort(
    (a, b) =>
      new Date(b.lastActivityAt!).getTime() -
      new Date(a.lastActivityAt!).getTime()
  );

  return squads;
}
