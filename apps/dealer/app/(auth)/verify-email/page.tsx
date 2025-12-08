'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

type VerificationState = 'loading' | 'success' | 'already_verified' | 'error';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [state, setState] = useState<VerificationState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMessage('No verification token provided');
      return;
    }

    const verifyEmail = async () => {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok) {
          setState('error');
          setErrorMessage(data.error || 'Verification failed');
          return;
        }

        if (data.alreadyVerified) {
          setState('already_verified');
        } else {
          setState('success');
        }
      } catch {
        setState('error');
        setErrorMessage('An unexpected error occurred');
      }
    };

    verifyEmail();
  }, [token]);

  if (state === 'loading') {
    return (
      <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 text-gray-400 animate-spin" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">
            Verifying your email...
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Please wait while we verify your email address.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-6 w-6 text-red-600" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-gray-900">
            Verification Failed
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {errorMessage}
          </p>
          <p className="mt-4 text-sm text-gray-500">
            The verification link may have expired or already been used.
          </p>
          <div className="mt-6 space-y-3">
            <Link
              href="/login"
              className="block w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Go to Login
            </Link>
            <Link
              href="/register"
              className="block w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Register Again
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'already_verified') {
    return (
      <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <CheckCircle className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-gray-900">
            Already Verified
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Your email has already been verified.
          </p>
          <div className="mt-6">
            <Link
              href="/login"
              className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="h-6 w-6 text-green-600" />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-gray-900">
          Email Verified!
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Thank you for verifying your email address.
        </p>
        
        <div className="mt-6 rounded-md bg-yellow-50 p-4">
          <p className="text-sm text-yellow-800">
            <strong>What's next?</strong> Your account is now pending approval by our team.
            We'll send you an email once your account is activated (typically 1-2 business days).
          </p>
        </div>
        
        <div className="mt-6">
          <Link
            href="/login"
            className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Return to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

function VerifyEmailFallback() {
  return (
    <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10">
      <div className="text-center">
        <Loader2 className="mx-auto h-12 w-12 text-gray-400 animate-spin" />
        <h2 className="mt-4 text-xl font-semibold text-gray-900">
          Loading...
        </h2>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailFallback />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
