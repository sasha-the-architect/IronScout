/**
 * Subscription Expired Notifications
 *
 * Sent when a dealer's subscription has expired and feed ingestion is skipped.
 * Rate-limited to once per day per dealer.
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
  SLACK_CONFIG,
  type SlackResult,
} from '../channels/slack.js';

// =============================================================================
// Types
// =============================================================================

export interface SubscriptionExpiredInfo {
  dealerId: string;
  businessName: string;
  tier: string;
  expiresAt: Date | null;
  isInGracePeriod: boolean;
  daysOverdue: number;
  feedId: string;
  feedName: string;
  dealerEmails: string[];
}

export interface NotificationResult {
  email: EmailResult[];
  slack: SlackResult;
}

// =============================================================================
// Subscription Expired Notification
// =============================================================================

/**
 * Notify dealer and IronScout staff that a subscription has expired
 * and feed ingestion was skipped.
 */
export async function notifyDealerSubscriptionExpired(
  info: SubscriptionExpiredInfo
): Promise<NotificationResult> {
  const renewUrl = `${EMAIL_CONFIG.dealerPortalUrl}/settings/billing`;
  const adminDetailUrl = `${EMAIL_CONFIG.adminPortalUrl}/dealers/${info.dealerId}`;

  const expiryDate = info.expiresAt
    ? new Date(info.expiresAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Unknown';

  const statusText = info.isInGracePeriod
    ? `Your subscription expired on ${expiryDate}. You have a grace period to renew.`
    : `Your subscription expired ${info.daysOverdue} days ago. Feed processing has been suspended.`;

  const urgencyLevel = info.isInGracePeriod ? 'warning' : 'error';
  const subjectPrefix = info.isInGracePeriod ? '⚠️' : '🚫';
  const subjectText = info.isInGracePeriod
    ? 'Subscription Expiring - Feed Processing Paused'
    : 'Subscription Expired - Feed Processing Suspended';

  // Send emails to all opted-in dealer contacts
  const emailResults: EmailResult[] = [];

  for (const dealerEmail of info.dealerEmails) {
    const emailResult = await sendEmail({
      to: dealerEmail,
      subject: `${subjectPrefix} ${subjectText}`,
      html: wrapEmailTemplate(`
        ${emailInfoBox(
          `
          <h2 style="margin: 0 0 10px 0; font-size: 18px;">${subjectPrefix} ${
            info.isInGracePeriod ? 'Subscription Expiring' : 'Subscription Expired'
          }</h2>
          <p style="margin: 0;">${statusText}</p>
        `,
          urgencyLevel
        )}

        <div style="background: #f9fafb; border-radius: 8px; padding: 25px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; width: 140px;">Business:</td>
              <td style="padding: 8px 0; color: #111;">${info.businessName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Plan:</td>
              <td style="padding: 8px 0; color: #111;">${info.tier}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Expired On:</td>
              <td style="padding: 8px 0; color: #b91c1c; font-weight: 600;">${expiryDate}</td>
            </tr>
            ${
              info.isInGracePeriod
                ? `
            <tr>
              <td style="padding: 8px 0; color: #666;">Grace Period:</td>
              <td style="padding: 8px 0; color: #d97706; font-weight: 600;">Active - Renew soon!</td>
            </tr>
            `
                : `
            <tr>
              <td style="padding: 8px 0; color: #666;">Days Overdue:</td>
              <td style="padding: 8px 0; color: #b91c1c; font-weight: 600;">${info.daysOverdue} days</td>
            </tr>
            `
            }
          </table>
        </div>

        <div style="background: #fef3c7; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #92400e;">What This Means</h3>
          <ul style="margin: 0; padding-left: 20px; color: #78350f;">
            <li style="margin-bottom: 8px;">Your product feed <strong>${info.feedName}</strong> was scheduled to run</li>
            <li style="margin-bottom: 8px;">Feed processing was <strong>skipped</strong> due to subscription status</li>
            <li style="margin-bottom: 8px;">Your product listings will become stale until renewed</li>
            <li>Renew now to resume automatic feed updates</li>
          </ul>
        </div>

        ${emailButton('Renew Subscription', renewUrl)}

        <div style="text-align: center; color: #888; font-size: 12px; margin-top: 20px;">
          <p style="margin: 0;">Questions? Contact support@ironscout.ai</p>
        </div>
      `),
      text: `${subjectText}

${statusText}

Business: ${info.businessName}
Plan: ${info.tier}
Expired On: ${expiryDate}
${info.isInGracePeriod ? 'Grace Period: Active - Renew soon!' : `Days Overdue: ${info.daysOverdue} days`}

What This Means:
- Your product feed "${info.feedName}" was scheduled to run
- Feed processing was skipped due to subscription status
- Your product listings will become stale until renewed
- Renew now to resume automatic feed updates

Renew subscription: ${renewUrl}

Questions? Contact support@ironscout.ai`,
    });

    emailResults.push(emailResult);
  }

  // Send Slack notification to IronScout staff
  const slackResult = await sendSlackMessage(
    {
      text: `${subjectPrefix} Subscription expired: ${info.businessName} - Feed skipped`,
      blocks: [
        slackHeader(`${subjectPrefix} Dealer Subscription Expired`),
        slackFieldsSection({
          Business: info.businessName,
          Plan: info.tier,
          'Expired On': expiryDate,
          Status: info.isInGracePeriod
            ? '⚠️ In Grace Period'
            : `🚫 ${info.daysOverdue} days overdue`,
          'Skipped Feed': info.feedName,
        }),
        slackDivider(),
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: info.isInGracePeriod
              ? '_Dealer has been notified. Feed processing paused until renewal._'
              : '_Feed processing suspended. Manual override available in admin portal._',
          },
        },
        slackActions(
          slackButton('View Dealer', adminDetailUrl, 'primary'),
          slackButton('Trigger Feed Manually', `${adminDetailUrl}#feeds`)
        ),
        slackContext(`Dealer ID: ${info.dealerId} • Feed ID: ${info.feedId}`),
      ],
    },
    SLACK_CONFIG.dealerOpsWebhookUrl
  );

  return { email: emailResults, slack: slackResult };
}
