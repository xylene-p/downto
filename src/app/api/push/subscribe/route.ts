import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const { endpoint, p256dh, auth: authKey } = await request.json();
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: 'Missing subscription fields' }, { status: 400 });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, endpoint, p256dh, auth: authKey },
      { onConflict: 'user_id,endpoint' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const { endpoint } = await request.json();
  if (!endpoint) {
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
  }

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint);

  return NextResponse.json({ ok: true });
}
