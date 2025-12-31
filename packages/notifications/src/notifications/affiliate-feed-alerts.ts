/**
 * Affiliate Feed Alert Notifications
 *
 * Sent when affiliate feed runs fail, circuit breaker triggers, or feeds auto-disable.
 */

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

export interface AffiliateFeedAlertInfo {
  feedId: string;
  feedName: string;
  sourceId: string;
  sourceName: string;
  retailerName?: string;
  network: string;
  runId?: string;
  correlationId?: string; // UUID for log correlation (failures only)
}

export interface CircuitBreakerMetrics {
  activeCountBefore: number;
  seenSuccessCount: number;
  wouldExpireCount: number;
  urlHashFallbackCount: number;
  expiryPercentage: number;
}

// =============================================================================
// Run Failed Notification
// =============================================================================

/**
 * Notify when an affiliate feed run fails
 */
export async function notifyAffiliateFeedRunFailed(
  feed: AffiliateFeedAlertInfo,
  error: string,
  consecutiveFailures: number
): Promise<SlackResult> {
  const adminDetailUrl = `${SLACK_CONFIG.adminPortalUrl}/affiliate-feeds/${feed.feedId}`;

  const result = await sendSlackMessage(
    {
      text: `Affiliate feed run failed: ${feed.feedName}`,
      blocks: [
        slackHeader('Affiliate Feed Run Failed'),
        slackFieldsSection({
          Feed: feed.feedName,
          Source: feed.sourceName,
          Network: feed.network,
          'Consecutive Failures': String(consecutiveFailures),
          Error: `\`${error.slice(0, 200)}\``,
        }),
        slackDivider(),
        slackActions(slackButton('View Feed', adminDetailUrl, 'danger')),
        slackContext(
          `Feed ID: ${feed.feedId}`,
          feed.runId ? `Run ID: ${feed.runId}` : '',
          feed.correlationId ? `Correlation ID: ${feed.correlationId}` : ''
        ),
      ],
    },
    SLACK_CONFIG.feedsWebhookUrl || SLACK_CONFIG.dealerOpsWebhookUrl
  );

  return result;
}

// =============================================================================
// Circuit Breaker Triggered Notification
// =============================================================================

/**
 * Notify when circuit breaker blocks a feed promotion
 */
export async function notifyCircuitBreakerTriggered(
  feed: AffiliateFeedAlertInfo,
  reason: 'SPIKE_THRESHOLD_EXCEEDED' | 'DATA_QUALITY_URL_HASH_SPIKE',
  metrics: CircuitBreakerMetrics
): Promise<SlackResult> {
  const adminDetailUrl = `${SLACK_CONFIG.adminPortalUrl}/affiliate-feeds/${feed.feedId}`;

  const reasonText =
    reason === 'SPIKE_THRESHOLD_EXCEEDED'
      ? `${metrics.expiryPercentage.toFixed(1)}% of products would expire (threshold: 20%)`
      : `${((metrics.urlHashFallbackCount / metrics.seenSuccessCount) * 100).toFixed(1)}% URL_HASH fallback (threshold: 50%)`;

  const result = await sendSlackMessage(
    {
      text: `Circuit breaker triggered: ${feed.feedName} - ${reason}`,
      blocks: [
        slackHeader('Circuit Breaker Triggered'),
        slackFieldsSection({
          Feed: feed.feedName,
          Source: feed.sourceName,
          Reason: reasonText,
          'Active Before': String(metrics.activeCountBefore),
          'Seen This Run': String(metrics.seenSuccessCount),
          'Would Expire': String(metrics.wouldExpireCount),
        }),
        slackDivider(),
        slackActions(
          slackButton('Review Feed', adminDetailUrl, 'danger'),
          slackButton('Approve Anyway', `${adminDetailUrl}?approve=${feed.runId}`)
        ),
        slackContext(
          `Feed ID: ${feed.feedId}`,
          feed.runId ? `Run ID: ${feed.runId}` : '',
          'Products NOT promoted - manual approval required'
        ),
      ],
    },
    SLACK_CONFIG.feedsWebhookUrl || SLACK_CONFIG.dealerOpsWebhookUrl
  );

  return result;
}

// =============================================================================
// Feed Auto-Disabled Notification
// =============================================================================

/**
 * Notify when a feed is automatically disabled after consecutive failures
 */
export async function notifyAffiliateFeedAutoDisabled(
  feed: AffiliateFeedAlertInfo,
  consecutiveFailures: number,
  lastError: string
): Promise<SlackResult> {
  const adminDetailUrl = `${SLACK_CONFIG.adminPortalUrl}/affiliate-feeds/${feed.feedId}`;

  const result = await sendSlackMessage(
    {
      text: `Affiliate feed auto-disabled: ${feed.feedName}`,
      blocks: [
        slackHeader('Affiliate Feed Auto-Disabled'),
        slackFieldsSection({
          Feed: feed.feedName,
          Source: feed.sourceName,
          Network: feed.network,
          'Consecutive Failures': String(consecutiveFailures),
          'Last Error': `\`${lastError.slice(0, 150)}\``,
        }),
        slackDivider(),
        slackActions(
          slackButton('Review & Re-enable', adminDetailUrl, 'danger')
        ),
        slackContext(
          `Feed ID: ${feed.feedId}`,
          feed.correlationId ? `Correlation ID: ${feed.correlationId}` : '',
          'Feed requires manual re-enablement after investigation'
        ),
      ],
    },
    SLACK_CONFIG.feedsWebhookUrl || SLACK_CONFIG.dealerOpsWebhookUrl
  );

  return result;
}

// =============================================================================
// Feed Run Succeeded (Recovery) Notification
// =============================================================================

/**
 * Notify when a feed run succeeds after previous failures
 */
export async function notifyAffiliateFeedRecovered(
  feed: AffiliateFeedAlertInfo,
  stats: {
    productsProcessed: number;
    productsPromoted: number;
    pricesWritten: number;
    durationMs: number;
  }
): Promise<SlackResult> {
  const adminDetailUrl = `${SLACK_CONFIG.adminPortalUrl}/affiliate-feeds/${feed.feedId}`;

  const result = await sendSlackMessage(
    {
      text: `Affiliate feed recovered: ${feed.feedName}`,
      blocks: [
        slackHeader('Affiliate Feed Recovered'),
        slackFieldsSection({
          Feed: feed.feedName,
          Source: feed.sourceName,
          'Products Processed': String(stats.productsProcessed),
          'Products Promoted': String(stats.productsPromoted),
          'Prices Written': String(stats.pricesWritten),
          Duration: `${(stats.durationMs / 1000).toFixed(1)}s`,
        }),
        slackDivider(),
        slackActions(slackButton('View Feed', adminDetailUrl)),
        slackContext(`Feed ID: ${feed.feedId}`),
      ],
    },
    SLACK_CONFIG.feedsWebhookUrl || SLACK_CONFIG.dealerOpsWebhookUrl
  );

  return result;
}
