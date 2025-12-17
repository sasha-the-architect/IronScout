import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { AlertTriangle } from 'lucide-react';

export default async function SuspendedPage() {
  const session = await getSession();
  
  // If not logged in or not a dealer, redirect
  if (!session || session.type !== 'dealer') {
    redirect('/login');
  }
  
  // If status is ACTIVE, redirect to dashboard
  if (session.status === 'ACTIVE') {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <Image
            src="/logo-dark.svg"
            alt="IronScout"
            width={48}
            height={48}
          />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Account Suspended
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              Your account has been suspended
            </h3>
            
            <p className="mt-2 text-sm text-gray-600">
              Access to the dealer portal for <strong>{session.businessName}</strong> has 
              been temporarily suspended. This may be due to a violation of our terms of 
              service or other policy concerns.
            </p>
            
            <p className="mt-4 text-sm text-gray-500">
              If you believe this is an error, please contact our support team.
            </p>
            
            <div className="mt-6 space-y-3">
              <a
                href="mailto:support@ironscout.ai"
                className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Contact Support
              </a>
              
              <div>
                <Link
                  href="/api/auth/logout"
                  className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
                >
                  Sign out
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
