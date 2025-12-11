import { NextResponse } from 'next/server';
import { z } from 'zod';
import { registerDealer } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sendVerificationEmail } from '@/lib/email';

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  businessName: z.string().min(2, 'Business name is required'),
  contactFirstName: z.string().min(1, 'First name is required'),
  contactLastName: z.string().min(1, 'Last name is required'),
  websiteUrl: z.string().url('Invalid website URL'),
  phone: z.string().optional(),
});

export async function POST(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const reqLogger = logger.child({ requestId, endpoint: '/api/auth/register' });
  
  reqLogger.info('Registration request received');
  
  try {
    let body: unknown;
    
    try {
      body = await request.json();
      reqLogger.debug('Request body parsed successfully');
    } catch (parseError) {
      reqLogger.warn('Failed to parse request body', {}, parseError);
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Validate input
    reqLogger.debug('Validating registration input');
    const validationResult = registerSchema.safeParse(body);
    
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      reqLogger.warn('Validation failed', { errors });
      return NextResponse.json(
        { error: errors[0].message },
        { status: 400 }
      );
    }

    const { email, password, businessName, contactFirstName, contactLastName, websiteUrl, phone } = validationResult.data;
    
    reqLogger.info('Registration validation passed', { 
      email, 
      businessName,
      hasPhone: !!phone 
    });

    const result = await registerDealer({
      email,
      password,
      businessName,
      contactFirstName,
      contactLastName,
      websiteUrl,
      phone,
    });

    if (!result.success) {
      reqLogger.warn('Registration rejected', { 
        email, 
        reason: result.error 
      });
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    reqLogger.info('Registration completed successfully', { 
      dealerId: result.dealer?.id,
      dealerUserId: result.dealerUser?.id,
      email,
      businessName 
    });

    // Send verification email (using dealerUser for email and token)
    reqLogger.debug('Sending verification email');
    const emailResult = await sendVerificationEmail(
      result.dealerUser!.email,
      result.dealer!.businessName,
      result.dealerUser!.verifyToken!
    );

    if (!emailResult.success) {
      reqLogger.error('Failed to send verification email', { 
        dealerId: result.dealer?.id,
        dealerUserId: result.dealerUser?.id,
        error: emailResult.error 
      });
      // Don't fail registration, but log the issue
      // The user can request a resend later
    } else {
      reqLogger.info('Verification email sent', { 
        dealerId: result.dealer?.id,
        dealerUserId: result.dealerUser?.id,
        messageId: emailResult.messageId 
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      emailSent: emailResult.success,
    });
  } catch (error) {
    reqLogger.error('Registration failed - unexpected error', {}, error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
