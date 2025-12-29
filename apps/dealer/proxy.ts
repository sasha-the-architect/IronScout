import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.DEALER_JWT_SECRET || process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'dealer-secret-change-me'
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

export async function proxy(request: NextRequest) {
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
  const isImpersonating = request.cookies.has('dealer-impersonation');
  let isDealerAuthenticated = false;
  let dealerSession: { dealerId: string; email: string; status: string } | null = null;
  
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
  
  
  // All routes require a dealer session (real or impersonated)
  // If an admin is impersonating (marker cookie), allow through even if token verification fails
  if (!isDealerAuthenticated && !isImpersonating) {
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
