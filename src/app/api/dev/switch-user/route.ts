import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-admin';

/**
 * Dev-only instant sign-in for two-user manual testing.
 *
 * Mints a one-time OTP via the service-role admin API for an *@test.com email
 * and returns it to the caller, who signs in with verifyOtp(). No real email
 * is sent. Lets you flip between test accounts in two browser windows without
 * OTP friction.
 *
 * Defense in depth — this route MUST never be reachable in prod:
 *   1. NODE_ENV gate: returns 404 in any non-development build (Vercel
 *      preview/prod set NODE_ENV=production).
 *   2. Allowlist gate: only @test.com addresses are honored. Even if (1) ever
 *      regressed, real user accounts still couldn't be hijacked.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@test\.com$/.test(email)) {
    return NextResponse.json(
      { error: 'Email must match *@test.com' },
      { status: 403 },
    );
  }

  const admin = getServiceClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (error || !data?.properties?.email_otp) {
    return NextResponse.json(
      { error: error?.message ?? 'Failed to generate link' },
      { status: 500 },
    );
  }

  return NextResponse.json({ email, otp: data.properties.email_otp });
}
