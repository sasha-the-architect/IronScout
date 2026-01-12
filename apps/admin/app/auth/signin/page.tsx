/**
 * Admin Login Page
 * OAuth-based authentication for admin users
 */

import { Shield, Chrome } from 'lucide-react'
import { signIn } from '@/lib/auth-config'

export default async function AdminSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const callbackUrl = resolvedSearchParams.callbackUrl || '/merchants'
  const error = resolvedSearchParams.error

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <div className="text-center mb-8">
          <Shield className="h-16 w-16 text-gray-900 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Admin Portal
          </h1>
          <p className="text-gray-600">
            Sign in with your admin account
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">
              {error === 'AccessDenied'
                ? 'Access denied. Your email is not authorized for admin access.'
                : error === 'Configuration'
                ? 'There is a problem with the server configuration.'
                : 'An error occurred during sign in. Please try again.'}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: callbackUrl })
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 text-gray-700 px-6 py-3 rounded-md font-medium hover:bg-gray-50 transition-colors"
            >
              <Chrome className="h-5 w-5" />
              Continue with Google
            </button>
          </form>

          {process.env.FACEBOOK_CLIENT_ID && (
            <form
              action={async () => {
                'use server'
                await signIn('facebook', { redirectTo: callbackUrl })
              }}
            >
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-3 bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700 transition-colors"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                Continue with Facebook
              </button>
            </form>
          )}

          {process.env.GITHUB_CLIENT_ID && (
            <form
              action={async () => {
                'use server'
                await signIn('github', { redirectTo: callbackUrl })
              }}
            >
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-3 bg-gray-900 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-800 transition-colors"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                Continue with GitHub
              </button>
            </form>
          )}
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Only authorized admin accounts can access this portal.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Contact your administrator if you need access.
          </p>
        </div>
      </div>
    </div>
  )
}
