import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from '@ironscout/db';

const DEALER_JWT_SECRET = new TextEncoder().encode(
  process.env.DEALER_JWT_SECRET || process.env.NEXTAUTH_SECRET || 'dealer-secret-change-me'
);

// Get the base URL for redirects
function getBaseUrl(request: NextRequest): string {
  // In production, use the configured URL or derive from request
  if (process.env.NODE_ENV === 'production') {
    return process.env.NEXTAUTH_URL || process.env.DEALER_PORTAL_URL || 'https://dealer.ironscout.ai';
  }
  // In development, use the request origin
  return request.nextUrl.origin;
}

// This endpoint receives a one-time impersonation token from admin
// and exchanges it for a dealer session cookie
export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request);
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get('token');

  if (!token) {
    console.error('Impersonation: No token provided');
    return NextResponse.redirect(`${baseUrl}/login?error=missing_token`);
  }

  try {
    // Verify the impersonation token
    const { payload } = await jwtVerify(token, DEALER_JWT_SECRET);

    // Check if this is an impersonation token
    if (!payload.isImpersonating) {
      console.error('Impersonation: Token is not an impersonation token');
      return NextResponse.redirect(`${baseUrl}/login?error=invalid_token`);
    }

    // Verify the dealer still exists and is valid
    const dealerUser = await prisma.dealerUser.findUnique({
      where: { id: payload.dealerUserId as string },
      include: { dealer: true },
    });

    if (!dealerUser) {
      console.error('Impersonation: Dealer user not found:', payload.dealerUserId);
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

    // Set the session cookie
    const cookieStore = await cookies();
    cookieStore.set('dealer-session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 4, // 4 hours
      path: '/',
    });

    // Set impersonation indicator cookie (readable by client)
    cookieStore.set('dealer-impersonation', JSON.stringify({
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

    console.log('Impersonation: Success for', dealerUser.email, 'by', payload.impersonatedBy);
    
    // Redirect to dashboard
    return NextResponse.redirect(`${baseUrl}/dashboard`);
  } catch (error) {
    console.error('Impersonation error:', error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error name:', error.name);
    }
    return NextResponse.redirect(`${baseUrl}/login?error=invalid_token`);
  }
}
