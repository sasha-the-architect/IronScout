/**
 * @ironscout/notifications
 * 
 * Unified notification service for IronScout platform.
 * Supports email (Resend) and Slack (Webhooks) channels.
 * 
 * Usage:
 * ```typescript
 * import { notifyNewDealerSignup, notifyDealerApproved } from '@ironscout/notifications';
 * 
 * await notifyNewDealerSignup({
 *   id: dealer.id,
 *   email: dealer.email,
 *   businessName: dealer.businessName,
 *   // ...
 * });
 * ```
 * 
 * Environment Variables:
 * - RESEND_API_KEY: Resend API key for email delivery
 * - EMAIL_FROM: From address for emails (default: IronScout <noreply@ironscout.ai>)
 * - ADMIN_NOTIFICATION_EMAIL: Admin email for notifications (default: operations@ironscout.ai)
 * - SLACK_DEALER_OPS_WEBHOOK_URL: Slack webhook URL for dealer operations notifications
 * - SLACK_FEEDS_WEBHOOK_URL: Optional separate webhook for feed alerts
 * - NEXT_PUBLIC_DEALER_URL: Dealer portal URL
 * - ADMIN_PORTAL_URL: Admin portal URL
 */

// =============================================================================
// Channel Exports (for advanced usage)
// =============================================================================

export {
  // Email
  sendEmail,
  wrapEmailTemplate,
  emailButton,
  emailInfoBox,
  EMAIL_CONFIG,
  type EmailResult,
  type SendEmailOptions,
} from './channels/email.js';

export {
  // Slack
  sendSlackMessage,
  slackHeader,
  slackText,
  slackDivider,
  slackContext,
  slackActions,
  slackButton,
  slackFieldsSection,
  SLACK_CONFIG,
  type SlackResult,
  type SlackMessage,
  type SlackBlock,
} from './channels/slack.js';

// =============================================================================
// Notification Exports (primary usage)
// =============================================================================

export {
  // Dealer Signup
  notifyNewDealerSignup,
  sendDealerVerificationEmail,
  type NewDealerInfo,
} from './notifications/dealer-signup.js';

export {
  // Dealer Status Changes
  notifyDealerApproved,
  notifyDealerSuspended,
  notifyDealerReactivated,
  type DealerStatusInfo,
} from './notifications/dealer-status.js';

export {
  // Password Reset
  sendPasswordResetEmail,
} from './notifications/password-reset.js';

export {
  // Feed Alerts
  notifyFeedFailed,
  notifyFeedRecovered,
  notifyFeedWarning,
  type FeedAlertInfo,
} from './notifications/feed-alerts.js';

export {
  // Subscription Expired
  notifyDealerSubscriptionExpired,
  type SubscriptionExpiredInfo,
} from './notifications/subscription-expired.js';

// =============================================================================
// Common Types
// =============================================================================

export interface NotificationResult {
  email: { success: boolean; messageId?: string; error?: string };
  slack: { success: boolean; error?: string };
}
