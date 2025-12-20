/**
 * Email Service for Admin Portal
 */

import { Resend } from 'resend';
import { logger } from './logger';

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

const FROM_EMAIL = process.env.EMAIL_FROM || 'IronScout <noreply@ironscout.ai>';
const DEALER_URL = process.env.NEXT_PUBLIC_DEALER_URL || 'https://dealer.ironscout.ai';

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send approval notification email to dealer
 */
export async function sendApprovalEmail(
  email: string,
  businessName: string
): Promise<SendEmailResult> {
  const emailLogger = logger.child({ action: 'sendApprovalEmail', email });
  
  emailLogger.info('Sending approval notification email');
  
  const loginUrl = `${DEALER_URL}/login`;
  
  try {
    const resend = getResendClient();
    
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Your IronScout Dealer account is approved',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #111; font-size: 24px; margin: 0;">IronScout</h1>
    <p style="color: #666; font-size: 14px; margin: 5px 0 0 0;">Dealer Portal</p>
  </div>
  
  <div style="background: #ecfdf5; border: 1px solid #6ee7b7; border-radius: 8px; padding: 30px; margin-bottom: 30px;">
    <h2 style="color: #065f46; font-size: 20px; margin: 0 0 15px 0;">${businessName} - Account Approved</h2>
    <p style="margin: 0; color: #047857;">Your IronScout Founding Dealer account has been approved.</p>
  </div>
  
  <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 30px;">
    <h3 style="color: #111; font-size: 16px; margin: 0 0 15px 0;">Next steps:</h3>
    <ul style="margin: 0; padding-left: 20px; color: #374151;">
      <li style="margin-bottom: 8px;">Configure your product feed</li>
      <li style="margin-bottom: 8px;">Review SKU matching status</li>
      <li style="margin-bottom: 8px;">Check market benchmarks</li>
      <li style="margin-bottom: 8px;">View click and conversion data</li>
    </ul>
    
    <div style="text-align: center; margin: 30px 0 0 0;">
      <a href="${loginUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-weight: 600;">Log In to Get Started</a>
    </div>
  </div>
  
  <div style="text-align: center; color: #888; font-size: 12px;">
    <p style="margin: 0;">&copy; ${new Date().getFullYear()} IronScout. All rights reserved.</p>
  </div>
</body>
</html>
      `,
      text: `${businessName} - Account Approved\n\nYour IronScout Founding Dealer account has been approved.\n\nLog in to get started: ${loginUrl}`,
    });

    if (error) {
      emailLogger.error('Failed to send approval email', { error: error.message });
      return { success: false, error: error.message };
    }

    emailLogger.info('Approval email sent', { messageId: data?.id });
    return { success: true, messageId: data?.id };
  } catch (error) {
    emailLogger.error('Error sending approval email', {}, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
