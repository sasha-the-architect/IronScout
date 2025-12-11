'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, UserCheck, Loader2, ExternalLink } from 'lucide-react';
import { resendVerificationEmail, impersonateDealer } from './actions';

interface AdminActionsProps {
  dealerId: string;
  businessName: string;
  ownerEmail: string | null;
  emailVerified: boolean;
}

export function AdminActions({ dealerId, businessName, ownerEmail, emailVerified }: AdminActionsProps) {
  const router = useRouter();
  const [isResending, setIsResending] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleResendVerification = async () => {
    if (!confirm(`Resend verification email to ${ownerEmail}?`)) {
      return;
    }

    setIsResending(true);
    setMessage(null);

    try {
      const result = await resendVerificationEmail(dealerId);
      if (result.success) {
        setMessage({ type: 'success', text: `Verification email sent to ${result.email}` });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to send email' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to send email' });
    } finally {
      setIsResending(false);
    }
  };

  const handleImpersonate = async () => {
    if (!confirm(`You are about to log in as ${businessName}. This action will be logged. Continue?`)) {
      return;
    }

    setIsImpersonating(true);
    setMessage(null);

    try {
      const result = await impersonateDealer(dealerId);
      if (result.success) {
        // Redirect to dealer portal
        window.open(result.redirectUrl, '_blank');
        setMessage({ type: 'success', text: `Impersonation session started for ${result.businessName}. Check the new tab.` });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to start impersonation' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to start impersonation' });
    } finally {
      setIsImpersonating(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-4">Admin Actions</h2>
      
      {message && (
        <div className={`mb-4 p-3 rounded-md text-sm ${
          message.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-700' 
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <div className="space-y-3">
        {/* Resend Verification Email */}
        {ownerEmail && !emailVerified && (
          <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <div>
              <p className="text-sm font-medium text-yellow-800">Email not verified</p>
              <p className="text-xs text-yellow-600">Owner: {ownerEmail}</p>
            </div>
            <button
              onClick={handleResendVerification}
              disabled={isResending}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-yellow-700 bg-yellow-100 rounded-md hover:bg-yellow-200 disabled:opacity-50"
            >
              {isResending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Resend Verification
            </button>
          </div>
        )}

        {ownerEmail && emailVerified && (
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
            <div>
              <p className="text-sm font-medium text-green-800">Email verified</p>
              <p className="text-xs text-green-600">Owner: {ownerEmail}</p>
            </div>
            <span className="text-xs text-green-600">✓ Verified</span>
          </div>
        )}

        {/* Impersonation */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div>
            <p className="text-sm font-medium text-gray-800">Support Access</p>
            <p className="text-xs text-gray-500">Log in as this dealer to provide support</p>
          </div>
          <button
            onClick={handleImpersonate}
            disabled={isImpersonating}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {isImpersonating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserCheck className="h-4 w-4" />
            )}
            Impersonate
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        All admin actions are logged for security and compliance purposes.
      </p>
    </div>
  );
}
