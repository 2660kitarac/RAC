/**
 * Next.js Middleware（Auth.js v5 版 - Edge Runtime 対応）
 *
 * External Middleware として Cloudflare Edge で動く。
 * req.cookies API の代わりに Cookie ヘッダーを直接解析する（確実に動作）。
 *
 * 公開パス: /login, /register, /reset-password, /mu/*, /api/*, /club/*
 * 保護パス: 上記以外（未認証 → /login へリダイレクト）
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// セッション cookie 名（本番: __Secure- prefix）
const SESSION_COOKIE_NAMES = [
  '__Secure-authjs.session-token',
  'authjs.session-token',
  // チャンク分割された場合（大きいJWT）
  '__Secure-authjs.session-token.0',
  'authjs.session-token.0',
];

// 公開パス（認証不要）
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/pending',
  '/reset-password',
  '/mu/',
  '/api/clubs/public',
  '/api/',
  '/club/',
];

/**
 * Cookie ヘッダー文字列を解析してセッション cookie の有無を確認する
 * req.cookies API とヘッダー直接解析の両方を試す
 */
function hasSessionCookie(req: NextRequest): boolean {
  // 方法1: req.cookies API
  for (const name of SESSION_COOKIE_NAMES) {
    const val = req.cookies.get(name)?.value;
    if (val && val.length > 10) {
      return true;
    }
  }

  // 方法2: Cookie ヘッダーを直接解析
  const cookieHeader = req.headers.get('cookie') || '';
  if (!cookieHeader) return false;

  for (const name of SESSION_COOKIE_NAMES) {
    // エスケープ処理してregexを作成
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`);
    const match = cookieHeader.match(regex);
    if (match && match[1] && match[1].trim().length > 10) {
      return true;
    }
  }

  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 静的ファイルは除外
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|map)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // 公開パス判定
  const isPublicPath = PUBLIC_PATHS.some(p => pathname.startsWith(p));

  // /api/debug-mw へのアクセスはデバッグ情報を返す（本番では削除）
  if (pathname === '/api/debug-mw') {
    const cookieHeader = req.headers.get('cookie') || '';
    const cookieNames: string[] = [];
    req.cookies.getAll().forEach(c => cookieNames.push(c.name));
    return NextResponse.json({
      hasSession: hasSessionCookie(req),
      cookieHeader: cookieHeader.substring(0, 200),
      cookieNamesViaAPI: cookieNames,
      pathname,
    });
  }

  // セッション cookie 確認
  const hasSession = hasSessionCookie(req);

  // 未認証 → /login へリダイレクト（公開パス除く）
  if (!hasSession && !isPublicPath) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 認証済み + /login or /register → /dashboard へリダイレクト
  if (hasSession && (pathname === '/login' || pathname === '/register')) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // 認証済み + /pending → そのまま通す（pending画面はサーバー側でstatusを確認）

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
