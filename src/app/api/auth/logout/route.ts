import { signOut } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  await signOut({ redirect: false });

  const requestUrl = new URL(request.url);
  const loginUrl = new URL('/login', requestUrl.origin);

  return NextResponse.redirect(loginUrl.toString());
}
