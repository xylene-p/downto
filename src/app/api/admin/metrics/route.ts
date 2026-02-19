import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase-admin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  // Auth: verify user via Bearer token
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin
  if (user.id !== process.env.ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getServiceClient();

  // Run queries in parallel
  const [totalRes, onboardedRes, notOnboardedRes, recentRes, signupsRes] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('onboarded', true),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('onboarded', false),
    admin.from('profiles')
      .select('username, display_name, created_at, onboarded')
      .order('created_at', { ascending: false })
      .limit(20),
    admin.from('profiles')
      .select('created_at')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true }),
  ]);

  // Group signups by date
  const signupsByDate: Record<string, number> = {};
  if (signupsRes.data) {
    for (const row of signupsRes.data) {
      const date = row.created_at.slice(0, 10); // YYYY-MM-DD
      signupsByDate[date] = (signupsByDate[date] || 0) + 1;
    }
  }

  return NextResponse.json({
    totalUsers: totalRes.count ?? 0,
    onboarded: onboardedRes.count ?? 0,
    notOnboarded: notOnboardedRes.count ?? 0,
    signupsByDate,
    recentSignups: recentRes.data ?? [],
  });
}
