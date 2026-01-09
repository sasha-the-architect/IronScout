/**
 * Slack Channel - Webhook Integration
 *
 * Sends notifications to Slack via Incoming Webhooks.
 *
 * Setup:
 * 1. Go to https://api.slack.com/apps
 * 2. Create a new app or select existing
 * 3. Enable "Incoming Webhooks"
 * 4. Add webhook to desired channel
 * 5. Copy webhook URL to SLACK_MERCHANT_OPS_WEBHOOK_URL env var
 *
 * Optional: Use SLACK_DATAFEED_ALERTS_WEBHOOK_URL for a separate feed alerts channel
 */

// =============================================================================
// Types
// =============================================================================

export interface SlackResult {
  success: boolean;
  error?: string;
}

export interface SlackTextBlock {
  type: 'section';
  text: {
    type: 'mrkdwn' | 'plain_text';
    text: string;
  };
  accessory?: SlackAccessory;
}

export interface SlackHeaderBlock {
  type: 'header';
  text: {
    type: 'plain_text';
    text: string;
    emoji?: boolean;
  };
}

export interface SlackDividerBlock {
  type: 'divider';
}

export interface SlackContextBlock {
  type: 'context';
  elements: Array<{
    type: 'mrkdwn' | 'plain_text';
    text: string;
  }>;
}

export interface SlackActionsBlock {
  type: 'actions';
  elements: SlackButtonElement[];
}

export interface SlackButtonElement {
  type: 'button';
  text: {
    type: 'plain_text';
    text: string;
    emoji?: boolean;
  };
  url?: string;
  style?: 'primary' | 'danger';
  action_id?: string;
}

export interface SlackAccessory {
  type: 'button';
  text: {
    type: 'plain_text';
    text: string;
    emoji?: boolean;
  };
  url?: string;
  action_id?: string;
}

export type SlackBlock = SlackTextBlock | SlackHeaderBlock | SlackDividerBlock | SlackContextBlock | SlackActionsBlock;

export interface SlackMessage {
  text: string; // Fallback text for notifications
  blocks?: SlackBlock[];
  channel?: string; // Override default channel (only works with bot tokens, not webhooks)
}

// =============================================================================
// Configuration
// =============================================================================

const merchantOpsWebhookUrl = process.env.SLACK_MERCHANT_OPS_WEBHOOK_URL;

export const SLACK_CONFIG = {
  merchantOpsWebhookUrl,
  datafeedAlertsWebhookUrl: process.env.SLACK_DATAFEED_ALERTS_WEBHOOK_URL,
  enabled: !!merchantOpsWebhookUrl,
  adminPortalUrl: process.env.ADMIN_PORTAL_URL || 'https://admin.ironscout.ai',
};

// =============================================================================
// Core Slack Function
// =============================================================================

export async function sendSlackMessage(
  message: SlackMessage,
  webhookUrl?: string
): Promise<SlackResult> {
  const url = webhookUrl || SLACK_CONFIG.merchantOpsWebhookUrl;
  
  if (!url) {
    console.log('[Slack] Webhook URL not configured, skipping notification');
    return { success: true }; // Don't fail if Slack isn't configured
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[Slack] Failed to send message:', text);
      return { success: false, error: text };
    }

    console.log('[Slack] Message sent successfully');
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Slack] Error:', message);
    return { success: false, error: message };
  }
}

// =============================================================================
// Slack Block Helpers
// =============================================================================

export function slackHeader(text: string): SlackHeaderBlock {
  return {
    type: 'header',
    text: { type: 'plain_text', text, emoji: true },
  };
}

export function slackText(text: string): SlackTextBlock {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text },
  };
}

export function slackDivider(): SlackDividerBlock {
  return { type: 'divider' };
}

export function slackContext(...texts: string[]): SlackContextBlock {
  return {
    type: 'context',
    elements: texts.map(text => ({ type: 'mrkdwn', text })),
  };
}

export function slackActions(...buttons: SlackButtonElement[]): SlackActionsBlock {
  return {
    type: 'actions',
    elements: buttons,
  };
}

export function slackButton(
  text: string,
  url: string,
  style?: 'primary' | 'danger'
): SlackButtonElement {
  return {
    type: 'button',
    text: { type: 'plain_text', text, emoji: true },
    url,
    style,
    action_id: `button_${Date.now()}`,
  };
}

export function slackFieldsSection(fields: Record<string, string>): SlackTextBlock {
  const text = Object.entries(fields)
    .map(([label, value]) => `*${label}:* ${value}`)
    .join('\n');
  
  return slackText(text);
}
