/**
 * Auth Error Page
 * Displays authentication errors
 */

import { Shield, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const error = searchParams.error

  const getErrorMessage = (error?: string) => {
    switch (error) {
      case 'Configuration':
        return 'There is a problem with the server configuration.'
      case 'AccessDenied':
        return 'You do not have permission to sign in. Your email must be authorized for admin access.'
      case 'Verification':
        return 'The sign in link is no longer valid. It may have already been used.'
      default:
        return 'An error occurred during authentication. Please try again.'
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Authentication Error
          </h1>
          <p className="text-gray-600">
            {getErrorMessage(error)}
          </p>
        </div>

        {error === 'AccessDenied' && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm text-yellow-800">
              <strong>Admin Access Required</strong>
              <br />
              Contact your administrator to request admin access.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <Link
            href="/auth/signin"
            className="block w-full text-center bg-gray-900 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-800 transition-colors"
          >
            Try Again
          </Link>

          <Link
            href="/"
            className="block w-full text-center border border-gray-300 text-gray-700 px-6 py-3 rounded-md font-medium hover:bg-gray-50 transition-colors"
          >
            Go to Main Site
          </Link>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Error code: {error || 'Unknown'}
          </p>
        </div>
      </div>
    </div>
  )
}
