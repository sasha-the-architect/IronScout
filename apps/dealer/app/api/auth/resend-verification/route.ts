import { NextResponse } from 'next/server';
import { prisma } from '@ironscout/db';
import { logger } from '@/lib/logger';
import { sendVerificationEmail } from '@/lib/email';

export async function POST(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const reqLogger = logger.child({ requestId, endpoint: '/api/auth/resend-verification' });
  
  reqLogger.info('Resend verification request received');
  
  try {
    let body: { email?: string };
    
    try {
      body = await request.json();
    } catch {
      reqLogger.warn('Failed to parse request body');
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { email } = body;

    if (!email) {
      reqLogger.warn('No email provided');
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    reqLogger.debug('Looking up dealer by email', { email });

    // Find dealer
    const dealer = await prisma.dealer.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always return success to prevent email enumeration
    if (!dealer) {
      reqLogger.warn('Dealer not found for resend', { email });
      return NextResponse.json({
        success: true,
        message: 'If an account with that email exists, a verification email has been sent.',
      });
    }

    if (dealer.emailVerified) {
      reqLogger.info('Email already verified', { dealerId: dealer.id });
      return NextResponse.json({
        success: true,
        message: 'If an account with that email exists, a verification email has been sent.',
      });
    }

    // Generate new token if needed
    let verifyToken = dealer.verifyToken;
    if (!verifyToken) {
      verifyToken = crypto.randomUUID();
      await prisma.dealer.update({
        where: { id: dealer.id },
        data: { verifyToken },
      });
      reqLogger.debug('Generated new verification token', { dealerId: dealer.id });
    }

    // Send verification email
    reqLogger.debug('Sending verification email', { dealerId: dealer.id });
    const emailResult = await sendVerificationEmail(
      dealer.email,
      dealer.businessName,
      verifyToken
    );

    if (!emailResult.success) {
      reqLogger.error('Failed to send verification email', { 
        dealerId: dealer.id,
        error: emailResult.error 
      });
      return NextResponse.json(
        { error: 'Failed to send verification email. Please try again later.' },
        { status: 500 }
      );
    }

    reqLogger.info('Verification email resent', { 
      dealerId: dealer.id,
      messageId: emailResult.messageId 
    });

    return NextResponse.json({
      success: true,
      message: 'If an account with that email exists, a verification email has been sent.',
    });
  } catch (error) {
    reqLogger.error('Resend verification failed', {}, error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
