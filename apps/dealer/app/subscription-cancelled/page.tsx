import { UserX, CreditCard, Mail, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getSessionWithDealer } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { checkSubscriptionStatus } from '@/lib/subscription';

export default async function SubscriptionCancelledPage() {
  const result = await getSessionWithDealer();

  // If not logged in, redirect to login
  if (!result || result.session.type !== 'dealer' || !result.dealer) {
    redirect('/login');
  }

  const { session, dealer } = result;
  const isImpersonating = session.type === 'dealer' && session.isImpersonating;

  // Check if user should actually be here
  const subscriptionStatus = checkSubscriptionStatus(dealer, isImpersonating);
  if (subscriptionStatus.redirectTo !== '/subscription-cancelled') {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        {/* Icon */}
        <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-6">
          <UserX className="h-8 w-8 text-gray-600" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Subscription Cancelled
        </h1>

        {/* Business name */}
        <p className="text-gray-600 mb-6">
          {dealer.businessName}
        </p>

        {/* Message */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <p className="text-gray-700 text-sm">
            Your subscription has been cancelled. Your data and feed configurations
            are still saved and will be restored when you resubscribe.
          </p>
        </div>

        {/* Benefits reminder */}
        <div className="text-left mb-6">
          <h2 className="font-semibold text-gray-900 mb-2">What you&apos;re missing:</h2>
          <ul className="text-sm text-gray-600 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-green-500">✓</span>
              Automatic product feed synchronization
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500">✓</span>
              Real-time market price benchmarks
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500">✓</span>
              Pricing insights for your catalog
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500">✓</span>
              Premium visibility on IronScout.ai
            </li>
          </ul>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Link
            href="/settings"
            className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            <CreditCard className="h-5 w-5" />
            Resubscribe
          </Link>

          <a
            href="mailto:support@ironscout.ai?subject=Resubscription%20Inquiry"
            className="flex items-center justify-center gap-2 w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            <Mail className="h-5 w-5" />
            Contact Sales
          </a>
        </div>

        {/* Logout link */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <Link
            href="/api/auth/logout"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Sign out
          </Link>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-8 text-sm text-gray-500">
        Questions about your account?{' '}
        <a href="mailto:support@ironscout.ai" className="text-blue-600 hover:underline">
          support@ironscout.ai
        </a>
      </p>
    </div>
  );
}
