import { supabase } from './supabase';
import type {
  Profile,
  Event,
  SavedEvent,
  Friendship,
  InterestCheck,
  CheckResponse,
  Squad,
  Message,
} from './types';

// ============================================================================
// PROFILES
// ============================================================================

export async function getCurrentProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) throw error;
  return data;
}

export async function updateProfile(updates: Partial<Profile>): Promise<Profile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================================================
// EVENTS
// ============================================================================

export async function getPublicEvents(date?: Date): Promise<Event[]> {
  let query = supabase
    .from('events')
    .select('*')
    .eq('is_public', true)
    .order('date', { ascending: true });

  if (date) {
    query = query.eq('date', date.toISOString().split('T')[0]);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createEvent(event: Omit<Event, 'id' | 'created_at'>): Promise<Event> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('events')
    .insert({ ...event, created_by: user.id })
    .select()
    .single();

  if (error) {
    throw new Error(`createEvent failed: ${error.message} (${error.code})`);
  }
  return data;
}

// ============================================================================
// SAVED EVENTS
// ============================================================================

export async function getSavedEvents(): Promise<(SavedEvent & { event: Event })[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('saved_events')
    .select('*, event:events(*)')
    .eq('user_id', user.id)
    .order('saved_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function saveEvent(eventId: string): Promise<SavedEvent> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('saved_events')
    .insert({ user_id: user.id, event_id: eventId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function unsaveEvent(eventId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('saved_events')
    .delete()
    .eq('user_id', user.id)
    .eq('event_id', eventId);

  if (error) throw error;
}

export async function toggleDown(eventId: string, isDown: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('saved_events')
    .update({ is_down: isDown })
    .eq('user_id', user.id)
    .eq('event_id', eventId);

  if (error) throw error;
}

export async function getPeopleDown(eventId: string): Promise<(SavedEvent & { user: Profile })[]> {
  const { data, error } = await supabase
    .from('saved_events')
    .select('*, user:profiles(*)')
    .eq('event_id', eventId)
    .eq('is_down', true);

  if (error) throw error;
  return data ?? [];
}

// ============================================================================
// FRIENDSHIPS
// ============================================================================

export async function getFriends(): Promise<Profile[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('friendships')
    .select(`
      requester:profiles!requester_id(*),
      addressee:profiles!addressee_id(*)
    `)
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  if (error) throw error;

  // Return the other person in each friendship
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((f: any) =>
    f.requester?.id === user.id ? f.addressee : f.requester
  ).filter(Boolean) as Profile[];
}

export async function getPendingRequests(): Promise<(Friendship & { requester: Profile })[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('friendships')
    .select('*, requester:profiles!requester_id(*)')
    .eq('addressee_id', user.id)
    .eq('status', 'pending');

  if (error) throw error;
  return data ?? [];
}

export async function sendFriendRequest(userId: string): Promise<Friendship> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('friendships')
    .insert({ requester_id: user.id, addressee_id: userId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId);

  if (error) throw error;
}

export async function removeFriend(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId);

  if (error) throw error;
}

// ============================================================================
// INTEREST CHECKS
// ============================================================================

export async function getActiveChecks(): Promise<(InterestCheck & { author: Profile; responses: (CheckResponse & { user: Profile })[] })[]> {
  const { data, error } = await supabase
    .from('interest_checks')
    .select(`
      *,
      author:profiles!author_id(*),
      responses:check_responses(*, user:profiles(*))
    `)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createInterestCheck(text: string, expiresInHours = 24): Promise<InterestCheck> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + expiresInHours);

  const { data, error } = await supabase
    .from('interest_checks')
    .insert({
      author_id: user.id,
      text,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function respondToCheck(
  checkId: string,
  response: 'down' | 'maybe' | 'nah'
): Promise<CheckResponse> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('check_responses')
    .upsert({
      check_id: checkId,
      user_id: user.id,
      response,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================================================
// SQUADS
// ============================================================================

export async function getSquads(): Promise<Squad[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // First get squads the user is a member of
  const { data: memberOf, error: memberError } = await supabase
    .from('squad_members')
    .select('squad_id')
    .eq('user_id', user.id);

  if (memberError) throw memberError;
  if (!memberOf || memberOf.length === 0) return [];

  const squadIds = memberOf.map(m => m.squad_id);

  // Then fetch those squads with their data
  const { data, error } = await supabase
    .from('squads')
    .select(`
      *,
      event:events(*)
    `)
    .in('id', squadIds)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createSquad(
  name: string,
  memberIds: string[],
  eventId?: string,
  checkId?: string
): Promise<Squad> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Create squad
  const { data: squad, error: squadError } = await supabase
    .from('squads')
    .insert({
      name,
      event_id: eventId,
      check_id: checkId,
      created_by: user.id,
    })
    .select()
    .single();

  if (squadError) throw squadError;

  // Add members (including creator)
  const allMemberIds = [...new Set([user.id, ...memberIds])];
  const { error: membersError } = await supabase
    .from('squad_members')
    .insert(
      allMemberIds.map((userId) => ({
        squad_id: squad.id,
        user_id: userId,
      }))
    );

  if (membersError) throw membersError;

  return squad;
}

// ============================================================================
// MESSAGES (with realtime)
// ============================================================================

export async function sendMessage(squadId: string, text: string): Promise<Message> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      squad_id: squadId,
      sender_id: user.id,
      text,
    })
    .select('*, sender:profiles(*)')
    .single();

  if (error) throw error;
  return data;
}

export function subscribeToMessages(
  squadId: string,
  callback: (message: Message) => void
) {
  return supabase
    .channel(`squad:${squadId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `squad_id=eq.${squadId}`,
      },
      (payload) => callback(payload.new as Message)
    )
    .subscribe();
}

// ============================================================================
// SEARCH
// ============================================================================

export async function searchUsers(query: string): Promise<Profile[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const sanitized = query.replace(/[%_]/g, '');
  if (!sanitized) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .or(`username.ilike.%${sanitized}%,display_name.ilike.%${sanitized}%`)
    .neq('id', user.id)
    .limit(20);

  if (error) throw error;
  return data ?? [];
}
