import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// JWT secret for merchant portal tokens
// Uses MERCHANT_JWT_SECRET, JWT_SECRET, or NEXTAUTH_SECRET
// If none are set, auth will fail gracefully (JWT verification will reject)
const jwtSecretString = process.env.MERCHANT_JWT_SECRET || process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
if (!jwtSecretString && process.env.NODE_ENV === 'production') {
  console.warn('[merchant-proxy] WARNING: No JWT secret configured. Auth will fail.');
}
const JWT_SECRET = new TextEncoder().encode(
  jwtSecretString || 'unconfigured-secret-auth-will-fail'
);

// Admin impersonation token secret (same as main app)
const ADMIN_IMPERSONATION_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'dev-only-admin-secret'
);

const SESSION_COOKIE = 'merchant-session';
const IMPERSONATION_COOKIE = 'merchant-impersonation-token';

// Routes that don't require authentication
const publicPaths = [
  '/login',
  '/register',
  '/verify',
  '/reset-password',
  '/forgot-password',
  '/api/auth',
];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Allow static files and API health checks
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  // Check for merchant session (try new cookie first, then legacy)
  const merchantToken = request.cookies.get(SESSION_COOKIE)?.value;
  const impersonationToken = request.cookies.get(IMPERSONATION_COOKIE)?.value;

  let isMerchantAuthenticated = false;
  let isValidImpersonation = false;
  let merchantSession: { merchantId: string; email: string; status: string } | null = null;

  // Verify merchant token
  if (merchantToken) {
    try {
      const { payload } = await jwtVerify(merchantToken, JWT_SECRET);
      isMerchantAuthenticated = true;
      merchantSession = {
        merchantId: payload.merchantId as string,
        email: payload.email as string,
        status: payload.status as string,
      };
    } catch {
      // Invalid token
    }
  }

  // Verify admin impersonation token (MUST validate, not just check existence)
  if (!isMerchantAuthenticated && impersonationToken) {
    try {
      const { payload } = await jwtVerify(impersonationToken, ADMIN_IMPERSONATION_SECRET);
      // Verify this is an impersonation token with required claims
      const merchantId = payload.merchantId as string;
      if (merchantId && payload.impersonatedBy) {
        isValidImpersonation = true;
        merchantSession = {
          merchantId,
          email: payload.email as string || 'impersonated@admin',
          status: payload.status as string || 'ACTIVE',
        };
      }
    } catch {
      // Invalid impersonation token - do not allow access
    }
  }

  // All routes require a valid merchant session OR valid admin impersonation
  // SECURITY: Must verify token validity, not just cookie existence
  if (!isMerchantAuthenticated && !isValidImpersonation) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If merchant is authenticated but status is not ACTIVE, redirect to pending page
  if (isMerchantAuthenticated && merchantSession?.status === 'PENDING') {
    if (pathname !== '/pending') {
      return NextResponse.redirect(new URL('/pending', request.url));
    }
  }

  // If merchant is authenticated but status is SUSPENDED, redirect to suspended page
  if (isMerchantAuthenticated && merchantSession?.status === 'SUSPENDED') {
    if (pathname !== '/suspended') {
      return NextResponse.redirect(new URL('/suspended', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
