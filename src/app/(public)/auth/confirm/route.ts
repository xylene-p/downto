import { type EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyMagicLink } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') || '/'; // Fallback to home page or specific path

  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = next; // The intended destination after auth

  console.log(token, type);

  if (token && type) {
    const { error } = await verifyMagicLink({ token });

    if (!error) {
      // User is now authenticated and session is stored in cookies
      return NextResponse.redirect(redirectTo);
    }
  }

  // If there's an error or missing params, redirect to an error page or login
  redirectTo.pathname = '/error'; // Or '/login?message=Could not verify user'
  return NextResponse.redirect(redirectTo);
}
