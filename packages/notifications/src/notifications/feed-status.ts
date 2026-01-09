/**
 * Feed Status Notifications
 *
 * Sent when retailer feed status changes (failures, warnings, recovered).
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

export interface FeedInfo {
  id: string;
  merchantId: string;
  merchantName: string;
  feedType: string;
  feedUrl?: string;
  errorMessage?: string;
  lastSuccessAt?: Date | null;
}

export interface FeedNotificationRecipient {
  email: string;
  name: string;
}

export interface NotificationResult {
  email: EmailResult;
  slack: SlackResult;
}

// =============================================================================
// Feed Failed Notification
// =============================================================================

export async function notifyFeedFailed(
  feed: FeedInfo,
  recipients: FeedNotificationRecipient[]
): Promise<NotificationResult> {
  const feedsUrl = `${EMAIL_CONFIG.merchantPortalUrl}/feeds`;
  const adminFeedUrl = `${EMAIL_CONFIG.adminPortalUrl}/merchants/${feed.merchantId}`;

  // Send email to merchant contacts
  const emailResult = await sendEmail({
    to: recipients.map(r => r.email),
    subject: `⚠️ Feed Error: ${feed.merchantName} - ${feed.feedType}`,
    html: wrapEmailTemplate(`
      ${emailInfoBox('<h2 style="margin: 0 0 10px 0; font-size: 18px;">⚠️ Feed Processing Failed</h2><p style="margin: 0;">We encountered an error while processing your product feed.</p>', 'error')}
      
      <div style="background: #f9fafb; border-radius: 8px; padding: 25px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666; width: 120px;">Feed Type:</td>
            <td style="padding: 8px 0; color: #111;">${feed.feedType}</td>
          </tr>
          ${feed.errorMessage ? `
          <tr>
            <td style="padding: 8px 0; color: #666; vertical-align: top;">Error:</td>
            <td style="padding: 8px 0; color: #b91c1c;">${feed.errorMessage}</td>
          </tr>
          ` : ''}
          ${feed.lastSuccessAt ? `
          <tr>
            <td style="padding: 8px 0; color: #666;">Last Success:</td>
            <td style="padding: 8px 0; color: #111;">${feed.lastSuccessAt.toLocaleString()}</td>
          </tr>
          ` : ''}
        </table>
      </div>
      
      <p style="margin: 20px 0;">Please check your feed configuration and ensure your feed URL is accessible.</p>
      
      ${emailButton('View Feed Settings', feedsUrl)}
      
      <div style="text-align: center; color: #888; font-size: 12px; margin-top: 20px;">
        <p style="margin: 0;">Need help? Contact support@ironscout.ai</p>
      </div>
    `),
    text: `Feed Processing Failed

We encountered an error while processing your product feed.

Feed Type: ${feed.feedType}${feed.errorMessage ? `\nError: ${feed.errorMessage}` : ''}${feed.lastSuccessAt ? `\nLast Success: ${feed.lastSuccessAt.toLocaleString()}` : ''}

Please check your feed configuration and ensure your feed URL is accessible.

View Feed Settings: ${feedsUrl}

Need help? Contact support@ironscout.ai`,
  });

  // Send Slack notification (to feeds channel if configured)
  const slackResult = await sendSlackMessage({
    text: `⚠️ Feed failed: ${feed.merchantName} - ${feed.feedType}`,
    blocks: [
      slackHeader('⚠️ Feed Processing Failed'),
      slackFieldsSection({
        'Merchant': feed.merchantName,
        'Feed Type': feed.feedType,
        ...(feed.errorMessage ? { 'Error': feed.errorMessage } : {}),
        'Status': '❌ Failed',
      }),
      slackDivider(),
      slackActions(
        slackButton('View in Admin', adminFeedUrl, 'primary')
      ),
      slackContext(`Feed ID: ${feed.id} • Merchant ID: ${feed.merchantId}`),
    ],
  }, SLACK_CONFIG.feedsWebhookUrl || SLACK_CONFIG.merchantOpsWebhookUrl);

  return { email: emailResult, slack: slackResult };
}

// =============================================================================
// Feed Recovered Notification
// =============================================================================

export async function notifyFeedRecovered(
  feed: FeedInfo,
  recipients: FeedNotificationRecipient[]
): Promise<NotificationResult> {
  const feedsUrl = `${EMAIL_CONFIG.merchantPortalUrl}/feeds`;
  const adminFeedUrl = `${EMAIL_CONFIG.adminPortalUrl}/merchants/${feed.merchantId}`;

  // Send email to merchant contacts
  const emailResult = await sendEmail({
    to: recipients.map(r => r.email),
    subject: `✅ Feed Recovered: ${feed.merchantName} - ${feed.feedType}`,
    html: wrapEmailTemplate(`
      ${emailInfoBox('<h2 style="margin: 0 0 10px 0; font-size: 18px;">✅ Feed Processing Recovered</h2><p style="margin: 0;">Your product feed is now processing successfully again.</p>', 'success')}
      
      <div style="background: #f9fafb; border-radius: 8px; padding: 25px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666; width: 120px;">Feed Type:</td>
            <td style="padding: 8px 0; color: #111;">${feed.feedType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Status:</td>
            <td style="padding: 8px 0;"><span style="background: #ecfdf5; color: #065f46; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">HEALTHY</span></td>
          </tr>
        </table>
      </div>
      
      ${emailButton('View Feed Dashboard', feedsUrl)}
    `),
    text: `Feed Processing Recovered

Your product feed is now processing successfully again.

Feed Type: ${feed.feedType}
Status: HEALTHY

View Feed Dashboard: ${feedsUrl}`,
  });

  // Send Slack notification
  const slackResult = await sendSlackMessage({
    text: `✅ Feed recovered: ${feed.merchantName} - ${feed.feedType}`,
    blocks: [
      slackHeader('✅ Feed Recovered'),
      slackFieldsSection({
        'Merchant': feed.merchantName,
        'Feed Type': feed.feedType,
        'Status': '✅ Healthy',
      }),
      slackDivider(),
      slackActions(
        slackButton('View in Admin', adminFeedUrl)
      ),
      slackContext(`Feed ID: ${feed.id} • Merchant ID: ${feed.merchantId}`),
    ],
  }, SLACK_CONFIG.feedsWebhookUrl || SLACK_CONFIG.merchantOpsWebhookUrl);

  return { email: emailResult, slack: slackResult };
}

// =============================================================================
// Feed Warning Notification (Degraded but not failed)
// =============================================================================

export async function notifyFeedWarning(
  feed: FeedInfo,
  warningMessage: string,
  recipients: FeedNotificationRecipient[]
): Promise<NotificationResult> {
  const feedsUrl = `${EMAIL_CONFIG.merchantPortalUrl}/feeds`;
  const adminFeedUrl = `${EMAIL_CONFIG.adminPortalUrl}/merchants/${feed.merchantId}`;

  // Send email to merchant contacts
  const emailResult = await sendEmail({
    to: recipients.map(r => r.email),
    subject: `⚠️ Feed Warning: ${feed.merchantName} - ${feed.feedType}`,
    html: wrapEmailTemplate(`
      ${emailInfoBox('<h2 style="margin: 0 0 10px 0; font-size: 18px;">⚠️ Feed Warning</h2><p style="margin: 0;">Your product feed is experiencing issues but is still processing.</p>', 'warning')}
      
      <div style="background: #f9fafb; border-radius: 8px; padding: 25px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666; width: 120px;">Feed Type:</td>
            <td style="padding: 8px 0; color: #111;">${feed.feedType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; vertical-align: top;">Warning:</td>
            <td style="padding: 8px 0; color: #92400e;">${warningMessage}</td>
          </tr>
        </table>
      </div>
      
      <p style="margin: 20px 0;">We recommend reviewing your feed to prevent potential issues.</p>
      
      ${emailButton('View Feed Settings', feedsUrl)}
    `),
    text: `Feed Warning

Your product feed is experiencing issues but is still processing.

Feed Type: ${feed.feedType}
Warning: ${warningMessage}

We recommend reviewing your feed to prevent potential issues.

View Feed Settings: ${feedsUrl}`,
  });

  // Send Slack notification
  const slackResult = await sendSlackMessage({
    text: `⚠️ Feed warning: ${feed.merchantName} - ${feed.feedType}`,
    blocks: [
      slackHeader('⚠️ Feed Warning'),
      slackFieldsSection({
        'Merchant': feed.merchantName,
        'Feed Type': feed.feedType,
        'Warning': warningMessage,
        'Status': '⚠️ Warning',
      }),
      slackDivider(),
      slackActions(
        slackButton('View in Admin', adminFeedUrl)
      ),
      slackContext(`Feed ID: ${feed.id} • Merchant ID: ${feed.merchantId}`),
    ],
  }, SLACK_CONFIG.feedsWebhookUrl || SLACK_CONFIG.merchantOpsWebhookUrl);

  return { email: emailResult, slack: slackResult };
}
