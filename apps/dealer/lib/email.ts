/**
 * Email Service for Dealer Portal
 * 
 * Uses Resend for transactional emails.
 * Set RESEND_API_KEY environment variable.
 */

import { Resend } from 'resend';
import { logger } from './logger';

// Initialize Resend client (lazy to avoid issues during build)
let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      logger.error('RESEND_API_KEY environment variable is not set');
      throw new Error('Email service not configured');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

// Email configuration
const FROM_EMAIL = process.env.EMAIL_FROM || 'IronScout <noreply@ironscout.ai>';
const BASE_URL = process.env.NEXT_PUBLIC_DEALER_URL || 'https://dealer.ironscout.ai';

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send verification email to newly registered dealer
 */
export async function sendVerificationEmail(
  email: string,
  businessName: string,
  verifyToken: string
): Promise<SendEmailResult> {
  const emailLogger = logger.child({ 
    action: 'sendVerificationEmail', 
    email,
    businessName 
  });
  
  emailLogger.info('Sending verification email');
  
  const verifyUrl = `${BASE_URL}/verify-email?token=${verifyToken}`;
  
  try {
    const resend = getResendClient();
    
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Verify your IronScout Dealer account',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #111; font-size: 24px; margin: 0;">IronScout</h1>
    <p style="color: #666; font-size: 14px; margin: 5px 0 0 0;">Dealer Portal</p>
  </div>
  
  <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 30px;">
    <h2 style="color: #111; font-size: 20px; margin: 0 0 15px 0;">Welcome, ${businessName}!</h2>
    <p style="margin: 0 0 20px 0;">Thank you for registering for the IronScout Founding Dealer Program. Please verify your email address to continue.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${verifyUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-weight: 600; font-size: 16px;">Verify Email Address</a>
    </div>
    
    <p style="margin: 0; font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
    <p style="margin: 10px 0 0 0; font-size: 12px; color: #888; word-break: break-all;">${verifyUrl}</p>
  </div>
  
  <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
    <p style="margin: 0; font-size: 14px; color: #92400e;">
      <strong>Note:</strong> After verifying your email, your account will be reviewed by our team. We'll notify you once approved (typically within 1-2 business days).
    </p>
  </div>
  
  <div style="text-align: center; color: #888; font-size: 12px;">
    <p style="margin: 0;">This link expires in 24 hours.</p>
    <p style="margin: 10px 0 0 0;">If you didn't create this account, you can safely ignore this email.</p>
  </div>
  
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
  
  <div style="text-align: center; color: #888; font-size: 12px;">
    <p style="margin: 0;">&copy; ${new Date().getFullYear()} IronScout. All rights reserved.</p>
  </div>
</body>
</html>
      `,
      text: `
Welcome to IronScout, ${businessName}!

Thank you for registering for the IronScout Founding Dealer Program.

Please verify your email address by clicking the link below:
${verifyUrl}

Note: After verifying your email, your account will be reviewed by our team. We'll notify you once approved (typically within 1-2 business days).

This link expires in 24 hours.

If you didn't create this account, you can safely ignore this email.

---
IronScout Dealer Portal
      `.trim(),
    });

    if (error) {
      emailLogger.error('Failed to send verification email', { error: error.message }, error);
      return { success: false, error: error.message };
    }

    emailLogger.info('Verification email sent successfully', { messageId: data?.id });
    return { success: true, messageId: data?.id };
  } catch (error) {
    emailLogger.error('Error sending verification email', {}, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  businessName: string,
  resetToken: string
): Promise<SendEmailResult> {
  const emailLogger = logger.child({ 
    action: 'sendPasswordResetEmail', 
    email 
  });
  
  emailLogger.info('Sending password reset email');
  
  const resetUrl = `${BASE_URL}/reset-password?token=${resetToken}`;
  
  try {
    const resend = getResendClient();
    
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Reset your IronScout Dealer password',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #111; font-size: 24px; margin: 0;">IronScout</h1>
    <p style="color: #666; font-size: 14px; margin: 5px 0 0 0;">Dealer Portal</p>
  </div>
  
  <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 30px;">
    <h2 style="color: #111; font-size: 20px; margin: 0 0 15px 0;">Password Reset Request</h2>
    <p style="margin: 0 0 20px 0;">Hi ${businessName}, we received a request to reset your password. Click the button below to choose a new password.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-weight: 600; font-size: 16px;">Reset Password</a>
    </div>
    
    <p style="margin: 0; font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
    <p style="margin: 10px 0 0 0; font-size: 12px; color: #888; word-break: break-all;">${resetUrl}</p>
  </div>
  
  <div style="text-align: center; color: #888; font-size: 12px;">
    <p style="margin: 0;">This link expires in 1 hour.</p>
    <p style="margin: 10px 0 0 0;">If you didn't request this, you can safely ignore this email.</p>
  </div>
  
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
  
  <div style="text-align: center; color: #888; font-size: 12px;">
    <p style="margin: 0;">&copy; ${new Date().getFullYear()} IronScout. All rights reserved.</p>
  </div>
</body>
</html>
      `,
      text: `
Password Reset Request

Hi ${businessName}, we received a request to reset your IronScout Dealer Portal password.

Click the link below to choose a new password:
${resetUrl}

This link expires in 1 hour.

If you didn't request this, you can safely ignore this email.

---
IronScout Dealer Portal
      `.trim(),
    });

    if (error) {
      emailLogger.error('Failed to send password reset email', { error: error.message }, error);
      return { success: false, error: error.message };
    }

    emailLogger.info('Password reset email sent successfully', { messageId: data?.id });
    return { success: true, messageId: data?.id };
  } catch (error) {
    emailLogger.error('Error sending password reset email', {}, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Send approval notification email
 */
export async function sendApprovalEmail(
  email: string,
  businessName: string
): Promise<SendEmailResult> {
  const emailLogger = logger.child({ 
    action: 'sendApprovalEmail', 
    email 
  });
  
  emailLogger.info('Sending approval notification email');
  
  const loginUrl = `${BASE_URL}/login`;
  
  try {
    const resend = getResendClient();
    
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: '🎉 Your IronScout Dealer account is approved!',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Approved</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #111; font-size: 24px; margin: 0;">IronScout</h1>
    <p style="color: #666; font-size: 14px; margin: 5px 0 0 0;">Dealer Portal</p>
  </div>
  
  <div style="background: #ecfdf5; border: 1px solid #6ee7b7; border-radius: 8px; padding: 30px; margin-bottom: 30px;">
    <h2 style="color: #065f46; font-size: 20px; margin: 0 0 15px 0;">🎉 Congratulations, ${businessName}!</h2>
    <p style="margin: 0 0 20px 0; color: #047857;">Your IronScout Founding Dealer account has been approved. You now have access to 12 months of Pro features absolutely free!</p>
  </div>
  
  <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 30px;">
    <h3 style="color: #111; font-size: 16px; margin: 0 0 15px 0;">What's included:</h3>
    <ul style="margin: 0; padding-left: 20px; color: #374151;">
      <li style="margin-bottom: 8px;">Automated product feed ingestion</li>
      <li style="margin-bottom: 8px;">AI-powered SKU matching</li>
      <li style="margin-bottom: 8px;">Market pricing insights</li>
      <li style="margin-bottom: 8px;">Click & conversion tracking</li>
      <li style="margin-bottom: 8px;">Priority listing on IronScout</li>
    </ul>
    
    <div style="text-align: center; margin: 30px 0 0 0;">
      <a href="${loginUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-weight: 600; font-size: 16px;">Log In to Get Started</a>
    </div>
  </div>
  
  <div style="text-align: center; color: #888; font-size: 12px;">
    <p style="margin: 0;">Questions? Reply to this email or contact support@ironscout.ai</p>
  </div>
  
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
  
  <div style="text-align: center; color: #888; font-size: 12px;">
    <p style="margin: 0;">&copy; ${new Date().getFullYear()} IronScout. All rights reserved.</p>
  </div>
</body>
</html>
      `,
      text: `
Congratulations, ${businessName}!

Your IronScout Founding Dealer account has been approved. You now have access to 12 months of Pro features absolutely free!

What's included:
- Automated product feed ingestion
- AI-powered SKU matching
- Market pricing insights
- Click & conversion tracking
- Priority listing on IronScout

Log in to get started: ${loginUrl}

Questions? Reply to this email or contact support@ironscout.ai

---
IronScout Dealer Portal
      `.trim(),
    });

    if (error) {
      emailLogger.error('Failed to send approval email', { error: error.message }, error);
      return { success: false, error: error.message };
    }

    emailLogger.info('Approval email sent successfully', { messageId: data?.id });
    return { success: true, messageId: data?.id };
  } catch (error) {
    emailLogger.error('Error sending approval email', {}, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Send admin notification when new dealer registers
 */
export async function sendAdminNewDealerNotification(
  dealerEmail: string,
  businessName: string,
  websiteUrl: string
): Promise<SendEmailResult> {
  const emailLogger = logger.child({ 
    action: 'sendAdminNewDealerNotification', 
    dealerEmail,
    businessName 
  });
  
  emailLogger.info('Sending admin notification for new dealer');
  
  const adminEmails = (process.env.ADMIN_NOTIFICATION_EMAILS || process.env.ADMIN_EMAILS || '').split(',').filter(Boolean);
  
  if (adminEmails.length === 0) {
    emailLogger.warn('No admin emails configured for notifications');
    return { success: false, error: 'No admin emails configured' };
  }
  
  const adminUrl = `${BASE_URL}/admin/dealers`;
  
  try {
    const resend = getResendClient();
    
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: adminEmails,
      subject: `New Dealer Registration: ${businessName}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Dealer Registration</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #111;">New Dealer Registration</h2>
  
  <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Business:</strong> ${businessName}</p>
    <p style="margin: 0 0 10px 0;"><strong>Email:</strong> ${dealerEmail}</p>
    <p style="margin: 0;"><strong>Website:</strong> <a href="${websiteUrl}">${websiteUrl}</a></p>
  </div>
  
  <p>A new dealer has registered and verified their email. Please review their application.</p>
  
  <div style="margin: 30px 0;">
    <a href="${adminUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">Review in Admin Panel</a>
  </div>
</body>
</html>
      `,
      text: `
New Dealer Registration

Business: ${businessName}
Email: ${dealerEmail}
Website: ${websiteUrl}

A new dealer has registered and verified their email. Please review their application.

Review in Admin Panel: ${adminUrl}
      `.trim(),
    });

    if (error) {
      emailLogger.error('Failed to send admin notification', { error: error.message }, error);
      return { success: false, error: error.message };
    }

    emailLogger.info('Admin notification sent successfully', { messageId: data?.id });
    return { success: true, messageId: data?.id };
  } catch (error) {
    emailLogger.error('Error sending admin notification', {}, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
