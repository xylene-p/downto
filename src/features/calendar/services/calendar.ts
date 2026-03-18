'use server';

import { createClient } from '@/lib/supabase/server';

export type CalendarCheck = {
  id: string;
  text: string;
  author_id: string;
  event_date: string | null;
  event_time: string | null;
  expires_at: string | null;
  author: { display_name: string; avatar_letter: string };
  myResponse: 'down' | 'waitlist' | null;
};

export type LeftCheck = {
  check_id: string;
  left_at: string;
  check: {
    id: string;
    text: string;
    author_id: string;
    event_date: string | null;
    event_time: string | null;
    expires_at: string | null;
    author: { display_name: string; avatar_letter: string };
  };
};

export async function getCalendarChecks(): Promise<CalendarCheck[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Get checks with event dates that the user responded to or authored
  const { data, error } = await supabase
    .from('interest_checks')
    .select(
      `
      id, text, author_id, event_date, event_time, expires_at,
      author:profiles!author_id(display_name, avatar_letter),
      responses:check_responses(user_id, response)
    `
    )
    .not('event_date', 'is', null)
    .is('archived_at', null)
    .or(
      `event_date.gte.${new Date().toISOString().slice(0, 10)},expires_at.gt.${new Date().toISOString()},expires_at.is.null`
    )
    .order('event_date', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as any[])
    .filter(
      (c) =>
        c.author_id === user.id ||
        c.responses?.some(
          (r: any) => r.user_id === user.id
        )
    )
    .map((c) => ({
      id: c.id,
      text: c.text,
      author_id: c.author_id,
      event_date: c.event_date,
      event_time: c.event_time?.replace(/\s*(AM)/gi, 'am').replace(/\s*(PM)/gi, 'pm') ?? null,
      expires_at: c.expires_at,
      author: c.author,
      myResponse:
        c.responses?.find((r: any) => r.user_id === user.id)?.response ??
        null,
    }));
}

export async function getLeftChecks(): Promise<LeftCheck[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('left_checks')
    .select(
      `
      check_id,
      left_at,
      check:interest_checks!check_id (
        id, text, author_id, event_date, event_time, expires_at,
        author:profiles!author_id ( display_name, avatar_letter )
      )
    `
    )
    .eq('user_id', user.id);

  if (error) throw error;
  return (data ?? []) as unknown as LeftCheck[];
}
