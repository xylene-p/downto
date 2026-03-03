import { NextResponse } from 'next/server';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type AuthResult =
  | { user: User; supabase: SupabaseClient }
  | { error: NextResponse };

/**
 * Authenticate an API request via its Authorization header.
 * Returns the authenticated user and a scoped Supabase client,
 * or an error NextResponse to return immediately.
 */
export async function authenticateRequest(
  request: Request,
): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { user, supabase };
}

export function isAuthError(result: AuthResult): result is { error: NextResponse } {
  return 'error' in result;
}
