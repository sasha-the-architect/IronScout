import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import { prisma } from '@ironscout/db';
import { loggers } from '@/lib/logger';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

// All apps use NEXTAUTH_SECRET as the single JWT secret
const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'dev-only-secret-not-for-production'
);

// Get the base URL for redirects
function getBaseUrl(request: NextRequest): string {
  // Always prefer explicit configuration
  const configuredUrl = process.env.NEXTAUTH_URL || process.env.MERCHANT_PORTAL_URL;

  if (configuredUrl) {
    // Remove trailing slashes
    return configuredUrl.replace(/\/+$/, '');
  }

  // In production without config, use the production URL
  if (process.env.NODE_ENV === 'production') {
    return 'https://merchant.ironscout.ai';
  }

  // In development, use the request origin
  return request.nextUrl.origin;
}

// This endpoint receives a one-time impersonation token from admin
// and exchanges it for a merchant session cookie
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
    MERCHANT_PORTAL_URL: process.env.MERCHANT_PORTAL_URL,
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
    const { payload } = await jwtVerify(token, JWT_SECRET);

    // Check if this is an impersonation token
    if (!payload.isImpersonating) {
      loggers.auth.error('Impersonation: Token is not an impersonation token');
      return NextResponse.redirect(`${baseUrl}/login?error=invalid_token`);
    }

    // Verify the merchant user still exists and is valid
    const merchantUserId = payload.merchantUserId as string;
    const merchantUser = await prisma.merchant_users.findUnique({
      where: { id: merchantUserId },
      include: { merchants: true },
    });

    if (!merchantUser) {
      loggers.auth.error('Impersonation: Merchant user not found', { merchantUserId });
      return NextResponse.redirect(`${baseUrl}/login?error=merchant_not_found`);
    }

    // Create a fresh session token
    const sessionToken = await new SignJWT({
      merchantUserId: merchantUser.id,
      merchantId: merchantUser.merchantId,
      // Common fields
      email: merchantUser.email,
      name: merchantUser.name,
      role: merchantUser.role,
      businessName: merchantUser.merchants.businessName,
      status: merchantUser.merchants.status,
      tier: merchantUser.merchants.tier,
      // Keep impersonation metadata
      isImpersonating: true,
      impersonatedBy: payload.impersonatedBy,
      impersonatedAt: payload.impersonatedAt,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('4h')
      .sign(JWT_SECRET);

    loggers.auth.info('Impersonation success', {
      merchantEmail: merchantUser.email,
      impersonatedBy: payload.impersonatedBy
    });

    // Create redirect response and set cookies on it
    // Note: cookies().set() doesn't work with redirects - must set on response directly
    const response = NextResponse.redirect(`${baseUrl}/dashboard`);

    // Set the session cookie
    response.cookies.set('merchant-session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 4, // 4 hours
      path: '/',
    });

    // Set impersonation indicator cookie (readable by client)
    response.cookies.set('merchant-impersonation', JSON.stringify({
      adminEmail: payload.impersonatedBy,
      merchantName: merchantUser.merchants.businessName,
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
