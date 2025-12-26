'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, CreditCard, Key, RefreshCw, AlertCircle, Pencil, Save, X, Search, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { updatePaymentDetails, searchStripeCustomers, validateStripeCustomer, validateStripeSubscription, getStripeCustomerSubscriptions, type StripeCustomerResult, type StripeSubscriptionResult } from './actions';

interface PaymentSectionProps {
  dealerId: string;
  dealerBusinessName: string;
  dealerEmail: string;
  paymentMethod: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  autoRenew: boolean;
}

export function PaymentSection({
  dealerId,
  dealerBusinessName,
  dealerEmail,
  paymentMethod,
  stripeCustomerId,
  stripeSubscriptionId,
  autoRenew,
}: PaymentSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    paymentMethod: paymentMethod || '',
    stripeCustomerId: stripeCustomerId || '',
    stripeSubscriptionId: stripeSubscriptionId || '',
    autoRenew,
  });

  // Stripe search and validation state
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<StripeCustomerResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [validatedCustomer, setValidatedCustomer] = useState<StripeCustomerResult | null>(null);
  const [validatedSubscription, setValidatedSubscription] = useState<StripeSubscriptionResult | null>(null);
  const [isValidatingCustomer, setIsValidatingCustomer] = useState(false);
  const [isValidatingSubscription, setIsValidatingSubscription] = useState(false);
  const [customerValidationError, setCustomerValidationError] = useState<string | null>(null);
  const [subscriptionValidationError, setSubscriptionValidationError] = useState<string | null>(null);
  const [availableSubscriptions, setAvailableSubscriptions] = useState<StripeSubscriptionResult[]>([]);

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

  // Search for Stripe customers
  const handleCustomerSearch = async () => {
    if (!customerSearchQuery.trim()) {
      setCustomerSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const result = await searchStripeCustomers(customerSearchQuery);
      if (result.success) {
        setCustomerSearchResults(result.customers);
        setShowCustomerResults(true);
      } else {
        setError(result.error || 'Failed to search customers');
      }
    } catch (err) {
      setError('Failed to search customers');
    } finally {
      setIsSearching(false);
    }
  };

  // Validate customer ID when it changes
  useEffect(() => {
    const validateCustomer = async () => {
      if (!formData.stripeCustomerId || !formData.stripeCustomerId.startsWith('cus_')) {
        setValidatedCustomer(null);
        setCustomerValidationError(null);
        setAvailableSubscriptions([]);
        return;
      }

      setIsValidatingCustomer(true);
      setCustomerValidationError(null);
      try {
        const result = await validateStripeCustomer(formData.stripeCustomerId);
        if (result.success && result.customer) {
          setValidatedCustomer(result.customer);
          setCustomerValidationError(null);

          // Load subscriptions for this customer
          const subsResult = await getStripeCustomerSubscriptions(formData.stripeCustomerId);
          if (subsResult.success) {
            setAvailableSubscriptions(subsResult.subscriptions);

            // Auto-select the first active subscription if none is selected
            if (!formData.stripeSubscriptionId && subsResult.subscriptions.length > 0) {
              const activeSub = subsResult.subscriptions.find(s => s.status === 'active') || subsResult.subscriptions[0];
              setFormData(prev => ({ ...prev, stripeSubscriptionId: activeSub.id }));
            }
          }
        } else {
          setValidatedCustomer(null);
          setCustomerValidationError(result.error || 'Customer not found');
          setAvailableSubscriptions([]);
        }
      } catch (err) {
        setValidatedCustomer(null);
        setCustomerValidationError('Failed to validate customer');
        setAvailableSubscriptions([]);
      } finally {
        setIsValidatingCustomer(false);
      }
    };

    validateCustomer();
  }, [formData.stripeCustomerId]);

  // Validate subscription ID when it changes
  useEffect(() => {
    const validateSubscription = async () => {
      if (!formData.stripeSubscriptionId || !formData.stripeSubscriptionId.startsWith('sub_')) {
        setValidatedSubscription(null);
        setSubscriptionValidationError(null);
        return;
      }

      setIsValidatingSubscription(true);
      setSubscriptionValidationError(null);
      try {
        const result = await validateStripeSubscription(formData.stripeSubscriptionId);
        if (result.success && result.subscription) {
          setValidatedSubscription(result.subscription);
          setSubscriptionValidationError(null);
        } else {
          setValidatedSubscription(null);
          setSubscriptionValidationError(result.error || 'Subscription not found');
        }
      } catch (err) {
        setValidatedSubscription(null);
        setSubscriptionValidationError('Failed to validate subscription');
      } finally {
        setIsValidatingSubscription(false);
      }
    };

    validateSubscription();
  }, [formData.stripeSubscriptionId]);

  const handleSelectCustomer = (customer: StripeCustomerResult) => {
    setFormData(prev => ({ ...prev, stripeCustomerId: customer.id }));
    setShowCustomerResults(false);
    setCustomerSearchQuery('');
    setCustomerSearchResults([]);
  };

  const handleEdit = () => {
    setIsEditing(true);
    setError(null);
    setSuccessMessage(null);
    // Reset form to current values
    setFormData({
      paymentMethod: paymentMethod || '',
      stripeCustomerId: stripeCustomerId || '',
      stripeSubscriptionId: stripeSubscriptionId || '',
      autoRenew,
    });
    // Pre-populate search with dealer info
    setCustomerSearchQuery(dealerBusinessName || dealerEmail || '');
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError(null);
    setSuccessMessage(null);
    setCustomerSearchQuery('');
    setCustomerSearchResults([]);
    setShowCustomerResults(false);
    setValidatedCustomer(null);
    setValidatedSubscription(null);
    setCustomerValidationError(null);
    setSubscriptionValidationError(null);
    setAvailableSubscriptions([]);
  };

  const handleSave = async () => {
    // Validate that customer and subscription exist in Stripe
    if (formData.paymentMethod === 'STRIPE') {
      if (!validatedCustomer) {
        setError('Please select a valid Stripe customer');
        return;
      }
      if (formData.stripeSubscriptionId && !validatedSubscription) {
        setError('Please select a valid Stripe subscription');
        return;
      }
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await updatePaymentDetails(dealerId, {
        paymentMethod: formData.paymentMethod === '' ? null : formData.paymentMethod as 'STRIPE' | 'PURCHASE_ORDER',
        stripeCustomerId: formData.stripeCustomerId || null,
        stripeSubscriptionId: formData.stripeSubscriptionId || null,
        autoRenew: formData.autoRenew,
      });

      if (result.success) {
        setSuccessMessage(result.message || 'Payment details updated successfully');
        setIsEditing(false);
        // Clear validation state
        setValidatedCustomer(null);
        setValidatedSubscription(null);
        setCustomerValidationError(null);
        setSubscriptionValidationError(null);
        setAvailableSubscriptions([]);
        // The page will revalidate automatically
      } else {
        setError(result.error || 'Failed to update payment details');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      // Error already logged by the server action
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-medium text-gray-900">Payment Details</h2>
        </div>
        {!isEditing && (
          <button
            onClick={handleEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
        )}
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">{successMessage}</p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {isEditing ? (
        // Edit mode - show form inputs with Stripe lookup
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Payment Method */}
            <div>
              <label htmlFor="paymentMethod" className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method
              </label>
              <select
                id="paymentMethod"
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Not set</option>
                <option value="STRIPE">Stripe</option>
                <option value="PURCHASE_ORDER">Purchase Order</option>
              </select>
            </div>

            {/* Auto Renew */}
            <div>
              <label htmlFor="autoRenew" className="block text-sm font-medium text-gray-700 mb-1">
                Auto Renew
              </label>
              <div className="flex items-center h-10">
                <input
                  type="checkbox"
                  id="autoRenew"
                  checked={formData.autoRenew}
                  onChange={(e) => setFormData({ ...formData, autoRenew: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="autoRenew" className="ml-2 text-sm text-gray-700">
                  Enable auto-renewal
                </label>
              </div>
            </div>
          </div>

          {/* Stripe Customer Search */}
          {formData.paymentMethod === 'STRIPE' && (
            <div className="space-y-4 border-t border-gray-200 pt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search Stripe Customer
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleCustomerSearch()}
                      placeholder="Search by business name, email, or customer ID..."
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={handleCustomerSearch}
                    disabled={isSearching || !customerSearchQuery.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    Search
                  </button>
                </div>

                {/* Search Results */}
                {showCustomerResults && customerSearchResults.length > 0 && (
                  <div className="mt-2 border border-gray-200 rounded-md bg-white shadow-sm max-h-60 overflow-y-auto">
                    {customerSearchResults.map((customer) => (
                      <button
                        key={customer.id}
                        onClick={() => handleSelectCustomer(customer)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {customer.name || 'Unnamed Customer'}
                            </p>
                            <p className="text-xs text-gray-500">{customer.email}</p>
                            <p className="text-xs text-gray-400 font-mono">{customer.id}</p>
                          </div>
                          <CheckCircle className="h-4 w-4 text-blue-600" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {showCustomerResults && customerSearchResults.length === 0 && (
                  <p className="mt-2 text-sm text-gray-500">No customers found</p>
                )}
              </div>

              {/* Stripe Customer ID */}
              <div>
                <label htmlFor="stripeCustomerId" className="block text-sm font-medium text-gray-700 mb-1">
                  Stripe Customer ID
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="stripeCustomerId"
                    value={formData.stripeCustomerId}
                    onChange={(e) => setFormData({ ...formData, stripeCustomerId: e.target.value })}
                    placeholder="cus_... or search above"
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 pr-10"
                  />
                  {isValidatingCustomer && (
                    <div className="absolute right-3 top-2.5">
                      <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
                    </div>
                  )}
                  {!isValidatingCustomer && validatedCustomer && (
                    <div className="absolute right-3 top-2.5">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </div>
                  )}
                  {!isValidatingCustomer && customerValidationError && formData.stripeCustomerId && (
                    <div className="absolute right-3 top-2.5">
                      <XCircle className="h-4 w-4 text-red-600" />
                    </div>
                  )}
                </div>
                {validatedCustomer && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                    <p className="font-medium text-green-800">✓ Verified in Stripe</p>
                    <p className="text-green-700">{validatedCustomer.name || validatedCustomer.email}</p>
                  </div>
                )}
                {customerValidationError && formData.stripeCustomerId && (
                  <p className="mt-1 text-xs text-red-600">{customerValidationError}</p>
                )}
              </div>

              {/* Stripe Subscription ID */}
              <div>
                <label htmlFor="stripeSubscriptionId" className="block text-sm font-medium text-gray-700 mb-1">
                  Stripe Subscription ID
                </label>

                {/* Show subscription dropdown if we have available subscriptions */}
                {availableSubscriptions.length > 0 && (
                  <select
                    value={formData.stripeSubscriptionId}
                    onChange={(e) => setFormData({ ...formData, stripeSubscriptionId: e.target.value })}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 mb-2"
                  >
                    <option value="">Select a subscription</option>
                    {availableSubscriptions.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.id} ({sub.status})
                      </option>
                    ))}
                  </select>
                )}

                <div className="relative">
                  <input
                    type="text"
                    id="stripeSubscriptionId"
                    value={formData.stripeSubscriptionId}
                    onChange={(e) => setFormData({ ...formData, stripeSubscriptionId: e.target.value })}
                    placeholder="sub_... or select above"
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 pr-10"
                  />
                  {isValidatingSubscription && (
                    <div className="absolute right-3 top-2.5">
                      <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
                    </div>
                  )}
                  {!isValidatingSubscription && validatedSubscription && (
                    <div className="absolute right-3 top-2.5">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </div>
                  )}
                  {!isValidatingSubscription && subscriptionValidationError && formData.stripeSubscriptionId && (
                    <div className="absolute right-3 top-2.5">
                      <XCircle className="h-4 w-4 text-red-600" />
                    </div>
                  )}
                </div>
                {validatedSubscription && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                    <p className="font-medium text-green-800">✓ Verified in Stripe</p>
                    <p className="text-green-700">
                      Status: {validatedSubscription.status} •
                      Renews: {validatedSubscription.currentPeriodEnd.toLocaleDateString()}
                    </p>
                  </div>
                )}
                {subscriptionValidationError && formData.stripeSubscriptionId && (
                  <p className="mt-1 text-xs text-red-600">{subscriptionValidationError}</p>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </div>
      ) : (
        // View mode - show current values
        <>
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
        </>
      )}
    </div>
  );
}
