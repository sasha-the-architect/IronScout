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

    reqLogger.debug('Looking up dealer by verify token');

    // Find dealer with this token
    const dealer = await prisma.dealer.findFirst({
      where: { verifyToken: token },
    });

    if (!dealer) {
      reqLogger.warn('Invalid or expired verification token', { tokenPrefix: token.substring(0, 8) });
      return NextResponse.json(
        { error: 'Invalid or expired verification token' },
        { status: 400 }
      );
    }

    if (dealer.emailVerified) {
      reqLogger.info('Email already verified', { dealerId: dealer.id });
      return NextResponse.json({
        success: true,
        message: 'Email already verified',
        alreadyVerified: true,
      });
    }

    reqLogger.info('Verifying email', { dealerId: dealer.id, email: dealer.email });

    // Update dealer to verified
    await prisma.dealer.update({
      where: { id: dealer.id },
      data: {
        emailVerified: true,
        verifyToken: null, // Clear the token
      },
    });

    reqLogger.info('Email verified successfully', { 
      dealerId: dealer.id, 
      businessName: dealer.businessName 
    });

    // Send admin notification that a new dealer needs approval
    reqLogger.debug('Sending admin notification');
    const adminEmailResult = await sendAdminNewDealerNotification(
      dealer.email,
      dealer.businessName,
      dealer.websiteUrl
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
