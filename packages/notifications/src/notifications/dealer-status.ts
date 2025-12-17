/**
 * Dealer Approval Notifications
 * 
 * Sent when a dealer's account status changes (approved, suspended, reactivated).
 */

import {
  sendEmail,
  wrapEmailTemplate,
  emailButton,
  emailInfoBox,
  EMAIL_CONFIG,
  type EmailResult,
} from '../channels/email.js';
import {
  sendSlackMessage,
  slackHeader,
  slackDivider,
  slackContext,
  slackActions,
  slackButton,
  slackFieldsSection,
  type SlackResult,
} from '../channels/slack.js';

// =============================================================================
// Types
// =============================================================================

export interface DealerStatusInfo {
  id: string;
  email: string;
  businessName: string;
  contactName?: string;
}

export interface NotificationResult {
  email: EmailResult;
  slack: SlackResult;
}

// =============================================================================
// Dealer Approved
// =============================================================================

export async function notifyDealerApproved(dealer: DealerStatusInfo): Promise<NotificationResult> {
  const loginUrl = `${EMAIL_CONFIG.dealerPortalUrl}/login`;
  const dealerDetailUrl = `${EMAIL_CONFIG.adminPortalUrl}/dealers/${dealer.id}`;

  // Send email to dealer
  const emailResult = await sendEmail({
    to: dealer.email,
    subject: '🎉 Your IronScout Dealer account is approved!',
    html: wrapEmailTemplate(`
      <div style="background: #ecfdf5; border: 1px solid #6ee7b7; border-radius: 8px; padding: 30px; margin-bottom: 30px;">
        <h2 style="color: #065f46; font-size: 20px; margin: 0 0 15px 0;">🎉 Congratulations, ${dealer.businessName}!</h2>
        <p style="margin: 0 0 20px 0; color: #047857;">Your IronScout Dealer account has been approved.</p>
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
        
        ${emailButton('Log In to Get Started', loginUrl)}
      </div>
      
      <div style="text-align: center; color: #888; font-size: 12px;">
        <p style="margin: 0;">Questions? Reply to this email or contact support@ironscout.ai</p>
      </div>
    `),
    text: `Congratulations, ${dealer.businessName}!

Your IronScout Dealer account has been approved.

What's included:
- Automated product feed ingestion
- AI-powered SKU matching
- Market pricing insights
- Click & conversion tracking
- Priority listing on IronScout

Log in to get started: ${loginUrl}

Questions? Reply to this email or contact support@ironscout.ai`,
  });

  // Send Slack notification
  const slackResult = await sendSlackMessage({
    text: `✅ Dealer approved: ${dealer.businessName}`,
    blocks: [
      slackHeader('✅ Dealer Approved'),
      slackFieldsSection({
        'Business': dealer.businessName,
        'Email': dealer.email,
        'Status': '✅ Active',
      }),
      slackDivider(),
      slackActions(
        slackButton('View in Admin', dealerDetailUrl)
      ),
      slackContext(`Dealer ID: ${dealer.id}`),
    ],
  });

  return { email: emailResult, slack: slackResult };
}

// =============================================================================
// Dealer Suspended
// =============================================================================

export async function notifyDealerSuspended(
  dealer: DealerStatusInfo,
  reason?: string
): Promise<NotificationResult> {
  const supportEmail = 'support@ironscout.ai';
  const dealerDetailUrl = `${EMAIL_CONFIG.adminPortalUrl}/dealers/${dealer.id}`;

  // Send email to dealer
  const emailResult = await sendEmail({
    to: dealer.email,
    subject: 'Your IronScout Dealer account has been suspended',
    html: wrapEmailTemplate(`
      ${emailInfoBox('<h2 style="margin: 0 0 10px 0; font-size: 18px;">Account Suspended</h2><p style="margin: 0;">Your IronScout Dealer account has been temporarily suspended.</p>', 'error')}
      
      <div style="background: #f9fafb; border-radius: 8px; padding: 25px; margin: 20px 0;">
        <p style="margin: 0 0 15px 0;"><strong>Business:</strong> ${dealer.businessName}</p>
        ${reason ? `<p style="margin: 0;"><strong>Reason:</strong> ${reason}</p>` : ''}
      </div>
      
      <p style="margin: 20px 0;">If you believe this is an error or would like to appeal this decision, please contact our support team:</p>
      
      ${emailButton('Contact Support', `mailto:${supportEmail}`)}
      
      <div style="text-align: center; color: #888; font-size: 12px; margin-top: 20px;">
        <p style="margin: 0;">Email: ${supportEmail}</p>
      </div>
    `),
    text: `Account Suspended

Your IronScout Dealer account has been temporarily suspended.

Business: ${dealer.businessName}${reason ? `\nReason: ${reason}` : ''}

If you believe this is an error or would like to appeal this decision, please contact our support team at ${supportEmail}`,
  });

  // Send Slack notification
  const slackResult = await sendSlackMessage({
    text: `🚫 Dealer suspended: ${dealer.businessName}`,
    blocks: [
      slackHeader('🚫 Dealer Suspended'),
      slackFieldsSection({
        'Business': dealer.businessName,
        'Email': dealer.email,
        'Status': '🚫 Suspended',
        ...(reason ? { 'Reason': reason } : {}),
      }),
      slackDivider(),
      slackActions(
        slackButton('View in Admin', dealerDetailUrl)
      ),
      slackContext(`Dealer ID: ${dealer.id}`),
    ],
  });

  return { email: emailResult, slack: slackResult };
}

// =============================================================================
// Dealer Reactivated
// =============================================================================

export async function notifyDealerReactivated(dealer: DealerStatusInfo): Promise<NotificationResult> {
  const loginUrl = `${EMAIL_CONFIG.dealerPortalUrl}/login`;
  const dealerDetailUrl = `${EMAIL_CONFIG.adminPortalUrl}/dealers/${dealer.id}`;

  // Send email to dealer
  const emailResult = await sendEmail({
    to: dealer.email,
    subject: '✅ Your IronScout Dealer account has been reactivated',
    html: wrapEmailTemplate(`
      ${emailInfoBox('<h2 style="margin: 0 0 10px 0; font-size: 18px;">🎉 Account Reactivated</h2><p style="margin: 0;">Great news! Your IronScout Dealer account has been reactivated.</p>', 'success')}
      
      <div style="background: #f9fafb; border-radius: 8px; padding: 25px; margin: 20px 0;">
        <p style="margin: 0 0 15px 0;"><strong>Business:</strong> ${dealer.businessName}</p>
        <p style="margin: 0;">Your account is now active and you have full access to all dealer features.</p>
      </div>
      
      ${emailButton('Log In Now', loginUrl)}
      
      <div style="text-align: center; color: #888; font-size: 12px; margin-top: 20px;">
        <p style="margin: 0;">Welcome back! If you have any questions, contact support@ironscout.ai</p>
      </div>
    `),
    text: `Account Reactivated

Great news! Your IronScout Dealer account has been reactivated.

Business: ${dealer.businessName}

Your account is now active and you have full access to all dealer features.

Log in now: ${loginUrl}

Welcome back! If you have any questions, contact support@ironscout.ai`,
  });

  // Send Slack notification
  const slackResult = await sendSlackMessage({
    text: `🔄 Dealer reactivated: ${dealer.businessName}`,
    blocks: [
      slackHeader('🔄 Dealer Reactivated'),
      slackFieldsSection({
        'Business': dealer.businessName,
        'Email': dealer.email,
        'Status': '✅ Active',
      }),
      slackDivider(),
      slackActions(
        slackButton('View in Admin', dealerDetailUrl)
      ),
      slackContext(`Dealer ID: ${dealer.id}`),
    ],
  });

  return { email: emailResult, slack: slackResult };
}
