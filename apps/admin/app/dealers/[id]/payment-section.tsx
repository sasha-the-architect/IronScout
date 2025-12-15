'use client';

import { ExternalLink, CreditCard, Key, RefreshCw, AlertCircle } from 'lucide-react';

interface PaymentSectionProps {
  dealerId: string;
  paymentMethod: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  autoRenew: boolean;
}

export function PaymentSection({
  paymentMethod,
  stripeCustomerId,
  stripeSubscriptionId,
  autoRenew,
}: PaymentSectionProps) {
  const stripeBaseUrl = process.env.NODE_ENV === 'production'
    ? 'https://dashboard.stripe.com'
    : 'https://dashboard.stripe.com/test';

  const customerUrl = stripeCustomerId
    ? `${stripeBaseUrl}/customers/${stripeCustomerId}`
    : null;

  const subscriptionUrl = stripeSubscriptionId
    ? `${stripeBaseUrl}/subscriptions/${stripeSubscriptionId}`
    : null;

  // Determine payment status
  const hasStripeSetup = paymentMethod === 'STRIPE' && stripeCustomerId;

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <CreditCard className="h-5 w-5 text-gray-400" />
        <h2 className="text-lg font-medium text-gray-900">Payment Details</h2>
      </div>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Payment Method */}
        <div>
          <dt className="text-sm font-medium text-gray-500">Payment Method</dt>
          <dd className="mt-1 text-sm text-gray-900">
            {paymentMethod === 'STRIPE' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                <CreditCard className="h-3 w-3" />
                Stripe
              </span>
            ) : paymentMethod === 'PURCHASE_ORDER' ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                Purchase Order
              </span>
            ) : (
              <span className="text-gray-500">Not set</span>
            )}
          </dd>
        </div>

        {/* Auto Renew */}
        <div>
          <dt className="text-sm font-medium text-gray-500">Auto Renew</dt>
          <dd className="mt-1 text-sm text-gray-900">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
              autoRenew
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700'
            }`}>
              <RefreshCw className="h-3 w-3" />
              {autoRenew ? 'Enabled' : 'Disabled'}
            </span>
          </dd>
        </div>

        {/* Stripe Customer ID */}
        <div>
          <dt className="text-sm font-medium text-gray-500 flex items-center gap-1">
            <Key className="h-3 w-3" />
            Stripe Customer ID
          </dt>
          <dd className="mt-1 text-sm">
            {stripeCustomerId ? (
              <a
                href={customerUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline font-mono text-xs"
              >
                {stripeCustomerId}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="text-gray-500">—</span>
            )}
          </dd>
        </div>

        {/* Stripe Subscription ID */}
        <div>
          <dt className="text-sm font-medium text-gray-500 flex items-center gap-1">
            <Key className="h-3 w-3" />
            Stripe Subscription ID
          </dt>
          <dd className="mt-1 text-sm">
            {stripeSubscriptionId ? (
              <a
                href={subscriptionUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline font-mono text-xs"
              >
                {stripeSubscriptionId}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="text-gray-500">—</span>
            )}
          </dd>
        </div>
      </dl>

      {/* Info banner for non-Stripe payment */}
      {paymentMethod === 'PURCHASE_ORDER' && (
        <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">Purchase Order Billing</p>
            <p className="mt-1">
              This dealer is billed via purchase order. Subscription status must be updated manually.
            </p>
          </div>
        </div>
      )}

      {/* Info banner for no payment method */}
      {!paymentMethod && (
        <div className="mt-4 flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium">No Payment Method</p>
            <p className="mt-1">
              This dealer has not set up a payment method. They may be a founding member or need to complete billing setup.
            </p>
          </div>
        </div>
      )}

      {/* Quick access to Stripe */}
      {hasStripeSetup && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex flex-wrap gap-3">
            {customerUrl && (
              <a
                href={customerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <ExternalLink className="h-4 w-4" />
                View Customer in Stripe
              </a>
            )}
            {subscriptionUrl && (
              <a
                href={subscriptionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <ExternalLink className="h-4 w-4" />
                View Subscription in Stripe
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
