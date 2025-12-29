import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import { prisma } from '@ironscout/db';
import { loggers } from '@/lib/logger';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

const DEALER_JWT_SECRET = new TextEncoder().encode(
  process.env.DEALER_JWT_SECRET || process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'dealer-secret-change-me'
);

// Get the base URL for redirects
function getBaseUrl(request: NextRequest): string {
  // Always prefer explicit configuration
  const configuredUrl = process.env.NEXTAUTH_URL || process.env.DEALER_PORTAL_URL;

  if (configuredUrl) {
    // Remove trailing slashes
    return configuredUrl.replace(/\/+$/, '');
  }

  // In production without config, use the production URL
  if (process.env.NODE_ENV === 'production') {
    return 'https://dealer.ironscout.ai';
  }

  // In development, use the request origin
  return request.nextUrl.origin;
}

// This endpoint receives a one-time impersonation token from admin
// and exchanges it for a dealer session cookie
export async function GET(request: NextRequest) {
  let baseUrl: string;

  try {
    baseUrl = getBaseUrl(request);
  } catch {
    baseUrl = 'http://localhost:3003';
  }

  loggers.auth.info('Impersonate route called', {
    url: request.url.substring(0, 100) + '...',
    method: request.method,
  });

  loggers.auth.info('Impersonate route environment', {
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    DEALER_PORTAL_URL: process.env.DEALER_PORTAL_URL,
    computedBaseUrl: baseUrl,
    requestOrigin: request.nextUrl.origin,
  });

  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get('token');

  loggers.auth.info('Impersonate token check', {
    hasToken: !!token,
    tokenLength: token?.length ?? 0,
  });

  if (!token) {
    loggers.auth.error('Impersonation: No token provided');
    return NextResponse.redirect(`${baseUrl}/login?error=missing_token`);
  }

  try {
    // Verify the impersonation token
    const { payload } = await jwtVerify(token, DEALER_JWT_SECRET);

    // Check if this is an impersonation token
    if (!payload.isImpersonating) {
      loggers.auth.error('Impersonation: Token is not an impersonation token');
      return NextResponse.redirect(`${baseUrl}/login?error=invalid_token`);
    }

    // Verify the dealer still exists and is valid
    const dealerUser = await prisma.dealerUser.findUnique({
      where: { id: payload.dealerUserId as string },
      include: { dealer: true },
    });

    if (!dealerUser) {
      loggers.auth.error('Impersonation: Dealer user not found', { dealerUserId: payload.dealerUserId });
      return NextResponse.redirect(`${baseUrl}/login?error=dealer_not_found`);
    }

    // Create a fresh session token
    const sessionToken = await new SignJWT({
      dealerUserId: dealerUser.id,
      dealerId: dealerUser.dealerId,
      email: dealerUser.email,
      name: dealerUser.name,
      role: dealerUser.role,
      businessName: dealerUser.dealer.businessName,
      status: dealerUser.dealer.status,
      tier: dealerUser.dealer.tier,
      // Keep impersonation metadata
      isImpersonating: true,
      impersonatedBy: payload.impersonatedBy,
      impersonatedAt: payload.impersonatedAt,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('4h')
      .sign(DEALER_JWT_SECRET);

    loggers.auth.info('Impersonation success', {
      dealerEmail: dealerUser.email,
      impersonatedBy: payload.impersonatedBy
    });

    // Create redirect response and set cookies on it
    // Note: cookies().set() doesn't work with redirects - must set on response directly
    const response = NextResponse.redirect(`${baseUrl}/dashboard`);

    // Set the session cookie
    response.cookies.set('dealer-session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 4, // 4 hours
      path: '/',
    });

    // Set impersonation indicator cookie (readable by client)
    response.cookies.set('dealer-impersonation', JSON.stringify({
      adminEmail: payload.impersonatedBy,
      dealerName: dealerUser.dealer.businessName,
      startedAt: payload.impersonatedAt,
    }), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 4,
      path: '/',
    });

    return response;
  } catch (error) {
    loggers.auth.error('Impersonation error', {}, error instanceof Error ? error : new Error(String(error)));
    return NextResponse.redirect(`${baseUrl}/login?error=invalid_token`);
  }
}
