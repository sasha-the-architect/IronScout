'use server';

import { getSession } from '@/lib/auth';
import { loggers } from '@/lib/logger';

const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface CheckoutResult {
  success: boolean;
  url?: string;
  sessionId?: string;
  error?: string;
}

interface PortalResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Create a Stripe Checkout session for dealer subscription
 */
export async function createCheckoutSession(
  dealerId: string,
  planId: string
): Promise<CheckoutResult> {
  const session = await getSession();

  if (!session || session.type !== 'dealer') {
    return { success: false, error: 'Unauthorized' };
  }

  // Only OWNER and ADMIN can manage billing
  if (session.role !== 'OWNER' && session.role !== 'ADMIN') {
    return { success: false, error: 'You do not have permission to manage billing' };
  }

  // Verify dealer ID matches session
  if (session.dealerId !== dealerId) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Map plan ID to price ID env var name
    const priceIdEnvVar =
      planId === 'pro'
        ? process.env.STRIPE_PRICE_ID_DEALER_PRO_MONTHLY
        : process.env.STRIPE_PRICE_ID_DEALER_STANDARD_MONTHLY;

    if (!priceIdEnvVar) {
      loggers.billing.error('Missing price ID for plan', { planId });
      return { success: false, error: 'Plan configuration error' };
    }

    const baseUrl = process.env.NEXT_PUBLIC_DEALER_URL || 'https://dealer.ironscout.ai';
    const successUrl = `${baseUrl}/settings/billing?success=true`;
    const cancelUrl = `${baseUrl}/settings/billing?cancelled=true`;

    const response = await fetch(`${API_URL}/api/payments/dealer/create-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        priceId: priceIdEnvVar,
        dealerId,
        successUrl,
        cancelUrl,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      loggers.billing.error('Checkout API error', { errorData });
      return {
        success: false,
        error: errorData.error || 'Failed to create checkout session',
      };
    }

    const data = await response.json();

    return {
      success: true,
      url: data.url,
      sessionId: data.sessionId,
    };
  } catch (error) {
    loggers.billing.error('Checkout error', {}, error instanceof Error ? error : new Error(String(error)));
    return {
      success: false,
      error: 'Failed to create checkout session. Please try again.',
    };
  }
}

/**
 * Create a Stripe Customer Portal session for billing management
 */
export async function createPortalSession(dealerId: string): Promise<PortalResult> {
  const session = await getSession();

  if (!session || session.type !== 'dealer') {
    return { success: false, error: 'Unauthorized' };
  }

  // Only OWNER and ADMIN can manage billing
  if (session.role !== 'OWNER' && session.role !== 'ADMIN') {
    return { success: false, error: 'You do not have permission to manage billing' };
  }

  // Verify dealer ID matches session
  if (session.dealerId !== dealerId) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_DEALER_URL || 'https://dealer.ironscout.ai';
    const returnUrl = `${baseUrl}/settings/billing`;

    const response = await fetch(`${API_URL}/api/payments/dealer/create-portal-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dealerId,
        returnUrl,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      loggers.billing.error('Portal API error', { errorData });
      return {
        success: false,
        error: errorData.error || 'Failed to open billing portal',
      };
    }

    const data = await response.json();

    return {
      success: true,
      url: data.url,
    };
  } catch (error) {
    loggers.billing.error('Portal error', {}, error instanceof Error ? error : new Error(String(error)));
    return {
      success: false,
      error: 'Failed to open billing portal. Please try again.',
    };
  }
}
