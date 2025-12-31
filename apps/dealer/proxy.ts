import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// JWT secret for dealer portal tokens
// CRITICAL: At least one of these must be set in production
const jwtSecretString = process.env.DEALER_JWT_SECRET || process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
if (!jwtSecretString && process.env.NODE_ENV === 'production') {
  throw new Error('CRITICAL: No JWT secret configured for dealer proxy.');
}
const JWT_SECRET = new TextEncoder().encode(
  jwtSecretString || 'dev-only-dealer-secret-not-for-production'
);

// Admin impersonation token secret (same as main app)
const ADMIN_IMPERSONATION_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'dev-only-admin-secret'
);

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
  
  // Check for dealer session
  const dealerToken = request.cookies.get('dealer-session')?.value;
  const impersonationToken = request.cookies.get('dealer-impersonation-token')?.value;
  let isDealerAuthenticated = false;
  let isValidImpersonation = false;
  let dealerSession: { dealerId: string; email: string; status: string } | null = null;

  // Verify dealer token
  if (dealerToken) {
    try {
      const { payload } = await jwtVerify(dealerToken, JWT_SECRET);
      isDealerAuthenticated = true;
      dealerSession = {
        dealerId: payload.dealerId as string,
        email: payload.email as string,
        status: payload.status as string,
      };
    } catch {
      // Invalid token
    }
  }

  // Verify admin impersonation token (MUST validate, not just check existence)
  if (!isDealerAuthenticated && impersonationToken) {
    try {
      const { payload } = await jwtVerify(impersonationToken, ADMIN_IMPERSONATION_SECRET);
      // Verify this is an impersonation token with required claims
      if (payload.dealerId && payload.impersonatedBy) {
        isValidImpersonation = true;
        dealerSession = {
          dealerId: payload.dealerId as string,
          email: payload.email as string || 'impersonated@admin',
          status: payload.status as string || 'ACTIVE',
        };
      }
    } catch {
      // Invalid impersonation token - do not allow access
    }
  }

  // All routes require a valid dealer session OR valid admin impersonation
  // SECURITY: Must verify token validity, not just cookie existence
  if (!isDealerAuthenticated && !isValidImpersonation) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  // If dealer is authenticated but status is not ACTIVE, redirect to pending page
  if (isDealerAuthenticated && dealerSession?.status === 'PENDING') {
    if (pathname !== '/pending') {
      return NextResponse.redirect(new URL('/pending', request.url));
    }
  }
  
  // If dealer is authenticated but status is SUSPENDED, redirect to suspended page
  if (isDealerAuthenticated && dealerSession?.status === 'SUSPENDED') {
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
