import { NextResponse } from 'next/server';
import { prisma } from '@ironscout/db';
import { logger } from '@/lib/logger';
import { sendAdminNewDealerNotification } from '@/lib/email';

export async function POST(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const reqLogger = logger.child({ requestId, endpoint: '/api/auth/verify-email' });
  
  reqLogger.info('Email verification request received');
  
  try {
    let body: { token?: string };
    
    try {
      body = await request.json();
    } catch {
      reqLogger.warn('Failed to parse request body');
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { token } = body;

    if (!token) {
      reqLogger.warn('No verification token provided');
      return NextResponse.json(
        { error: 'Verification token is required' },
        { status: 400 }
      );
    }

    reqLogger.debug('Looking up dealer user by verify token');

    // Find dealer user with this token (include dealer info)
    const dealerUser = await prisma.dealerUser.findFirst({
      where: { verifyToken: token },
      include: { dealer: true },
    });

    if (!dealerUser) {
      reqLogger.warn('Invalid or expired verification token', { tokenPrefix: token.substring(0, 8) });
      return NextResponse.json(
        { error: 'Invalid or expired verification token' },
        { status: 400 }
      );
    }

    if (dealerUser.emailVerified) {
      reqLogger.info('Email already verified', { dealerUserId: dealerUser.id });
      return NextResponse.json({
        success: true,
        message: 'Email already verified',
        alreadyVerified: true,
      });
    }

    reqLogger.info('Verifying email', { 
      dealerUserId: dealerUser.id, 
      dealerId: dealerUser.dealerId,
      email: dealerUser.email 
    });

    // Update dealer user to verified
    await prisma.dealerUser.update({
      where: { id: dealerUser.id },
      data: {
        emailVerified: true,
        verifyToken: null, // Clear the token
      },
    });

    reqLogger.info('Email verified successfully', { 
      dealerUserId: dealerUser.id,
      dealerId: dealerUser.dealerId, 
      businessName: dealerUser.dealer.businessName 
    });

    // Send admin notification that a new dealer needs approval
    reqLogger.debug('Sending admin notification');
    const adminEmailResult = await sendAdminNewDealerNotification(
      dealerUser.dealer.id,
      dealerUser.email,
      dealerUser.dealer.businessName,
      dealerUser.dealer.contactName,
      dealerUser.dealer.websiteUrl,
      dealerUser.dealer.phone
    );

    if (!adminEmailResult.success) {
      reqLogger.warn('Failed to send admin notification', { error: adminEmailResult.error });
      // Don't fail the verification just because admin notification failed
    }

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully. Your account is pending admin approval.',
    });
  } catch (error) {
    reqLogger.error('Email verification failed', {}, error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
