'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CreditCard,
  Calendar,
  Check,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Crown,
  Zap,
} from 'lucide-react';
import { createCheckoutSession, createPortalSession } from './actions';
import { logger } from '@/lib/logger';

interface DealerBillingData {
  id: string;
  businessName: string;
  tier: string;
  subscriptionStatus: string;
  subscriptionExpiresAt: string | null;
  subscriptionGraceDays: number | null;
  paymentMethod: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  autoRenew: boolean | null;
}

interface BillingSettingsProps {
  dealer: DealerBillingData;
  canManage: boolean;
}

const PLANS = [
  {
    id: 'standard',
    name: 'Standard',
    price: 99,
    priceId: 'STRIPE_PRICE_ID_DEALER_STANDARD_MONTHLY',
    features: [
      'Product listings in IronScout',
      'Product feed ingestion',
      'Caliber-level market benchmarks',
      'Basic pricing context',
      'Email support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 299,
    priceId: 'STRIPE_PRICE_ID_DEALER_PRO_MONTHLY',
    features: [
      'Everything in Standard',
      'More frequent refresh',
      'SKU-level comparisons when available',
      'Historical pricing context',
      'API access',
      'Phone and email support',
    ],
    popular: true,
  },
];

export function BillingSettings({ dealer, canManage }: BillingSettingsProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const hasActiveSubscription =
    dealer.subscriptionStatus === 'ACTIVE' && dealer.stripeSubscriptionId;
  const isExpired = dealer.subscriptionStatus === 'EXPIRED';
  const isCancelled = dealer.subscriptionStatus === 'CANCELLED';
  const isSuspended = dealer.subscriptionStatus === 'SUSPENDED';
  const isFounding = dealer.tier === 'FOUNDING';

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleSubscribe = async (planId: string) => {
    if (!canManage) return;

    setIsLoading(true);
    setLoadingAction(planId);
    setError(null);

    try {
      const result = await createCheckoutSession(dealer.id, planId);

      if (result.success && result.url) {
        // Redirect to Stripe Checkout
        window.location.href = result.url;
      } else {
        setError(result.error || 'Failed to create checkout session');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      logger.error('Checkout error', {}, err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
      setLoadingAction(null);
    }
  };

  const handleManageBilling = async () => {
    if (!canManage) return;

    setIsLoading(true);
    setLoadingAction('portal');
    setError(null);

    try {
      const result = await createPortalSession(dealer.id);

      if (result.success && result.url) {
        // Redirect to Stripe Customer Portal
        window.location.href = result.url;
      } else {
        setError(result.error || 'Failed to open billing portal');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      logger.error('Portal error', {}, err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
      setLoadingAction(null);
    }
  };

  const getStatusBadge = () => {
    if (isFounding) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700">
          <Crown className="h-4 w-4" />
          Founding Member
        </span>
      );
    }

    switch (dealer.subscriptionStatus) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
            <Check className="h-4 w-4" />
            Active
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-700">
            <AlertTriangle className="h-4 w-4" />
            Expired
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
            Cancelled
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
            Suspended
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
            {dealer.subscriptionStatus}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Current Subscription Card */}
      <div className="rounded-lg bg-white shadow">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Current Subscription
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {dealer.businessName}
              </p>
            </div>
            {getStatusBadge()}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Plan */}
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-gray-500">
                <Zap className="h-5 w-5" />
                <span className="text-sm font-medium">Plan</span>
              </div>
              <p className="mt-2 text-xl font-semibold text-gray-900">
                {dealer.tier}
              </p>
            </div>

            {/* Next Billing Date */}
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-gray-500">
                <Calendar className="h-5 w-5" />
                <span className="text-sm font-medium">
                  {isExpired || isCancelled ? 'Expired On' : 'Next Billing'}
                </span>
              </div>
              <p className="mt-2 text-xl font-semibold text-gray-900">
                {formatDate(dealer.subscriptionExpiresAt)}
              </p>
              {dealer.autoRenew === false && hasActiveSubscription && (
                <p className="mt-1 text-xs text-yellow-600">
                  Will not renew automatically
                </p>
              )}
            </div>

            {/* Payment Method */}
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-gray-500">
                <CreditCard className="h-5 w-5" />
                <span className="text-sm font-medium">Payment Method</span>
              </div>
              <p className="mt-2 text-xl font-semibold text-gray-900">
                {dealer.paymentMethod === 'STRIPE'
                  ? 'Credit Card'
                  : dealer.paymentMethod === 'PURCHASE_ORDER'
                  ? 'Invoice'
                  : 'Not Set'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          {canManage && hasActiveSubscription && (
            <div className="mt-6">
              <button
                onClick={handleManageBilling}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingAction === 'portal' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                Manage Billing
              </button>
              <p className="mt-2 text-xs text-gray-500">
                Update payment method, view invoices, or cancel subscription
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Founding Member Info */}
      {isFounding && (
        <div className="rounded-lg bg-purple-50 p-4">
          <div className="flex items-start gap-3">
            <Crown className="h-5 w-5 text-purple-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-purple-900">Founding Member Benefits</h4>
              <p className="mt-1 text-sm text-purple-700">
                As a founding member, you have access to all Pro features for your first year.
                Your subscription will need to be activated before{' '}
                {formatDate(dealer.subscriptionExpiresAt)} to continue service.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plan Selection - Show when no active subscription or expired */}
      {canManage && (!hasActiveSubscription || isExpired || isCancelled) && (
        <div className="rounded-lg bg-white shadow">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900">
              {isExpired || isCancelled ? 'Reactivate Your Subscription' : 'Choose a Plan'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Select a plan to get started with IronScout dealer features
            </p>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              {PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={`relative rounded-lg border-2 p-6 ${
                    plan.popular
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-3 left-4 rounded-full bg-orange-500 px-3 py-1 text-xs font-medium text-white">
                      Most Popular
                    </span>
                  )}

                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-gray-900">
                      ${plan.price}
                    </span>
                    <span className="text-gray-500">/month</span>
                  </div>

                  <h4 className="mt-4 text-lg font-semibold text-gray-900">
                    {plan.name}
                  </h4>

                  <ul className="mt-4 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="h-5 w-5 flex-shrink-0 text-green-500" />
                        <span className="text-sm text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={isLoading}
                    className={`mt-6 w-full rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                      plan.popular
                        ? 'bg-orange-600 text-white hover:bg-orange-700'
                        : 'bg-gray-900 text-white hover:bg-gray-800'
                    }`}
                  >
                    {loadingAction === plan.id ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processing...
                      </span>
                    ) : (
                      `Subscribe to ${plan.name}`
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Suspended Notice */}
      {isSuspended && (
        <div className="rounded-lg bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-900">Account Suspended</h4>
              <p className="mt-1 text-sm text-red-700">
                Your account has been suspended. Please contact{' '}
                <a
                  href="mailto:support@ironscout.ai"
                  className="font-medium underline hover:no-underline"
                >
                  support@ironscout.ai
                </a>{' '}
                to resolve this issue.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* FAQ Section */}
      <div className="rounded-lg bg-gray-50 p-6">
        <h3 className="text-lg font-semibold text-gray-900">
          Billing FAQ
        </h3>
        <div className="mt-4 space-y-4">
          <div>
            <h4 className="font-medium text-gray-900">
              How does billing work?
            </h4>
            <p className="mt-1 text-sm text-gray-600">
              Subscriptions are billed monthly. You can cancel anytime from the
              Manage Billing portal.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-gray-900">
              What happens if my payment fails?
            </h4>
            <p className="mt-1 text-sm text-gray-600">
              You'll have a {dealer.subscriptionGraceDays || 7}-day grace period to update
              your payment method before losing access to dealer features.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-gray-900">
              Can I change my plan?
            </h4>
            <p className="mt-1 text-sm text-gray-600">
              Yes! You can upgrade or downgrade anytime from the Manage Billing
              portal. Changes take effect on your next billing date.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
