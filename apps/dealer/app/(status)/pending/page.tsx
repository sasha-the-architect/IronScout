import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Clock } from 'lucide-react';

export default async function PendingPage() {
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
          Account Pending Approval
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              Thank you for registering!
            </h3>
            
            <p className="mt-2 text-sm text-gray-600">
              Your dealer account for <strong>{session.businessName}</strong> is currently 
              under review. Our team will verify your information and approve your account 
              within 1-2 business days.
            </p>
            
            <p className="mt-4 text-sm text-gray-500">
              You'll receive an email at <strong>{session.email}</strong> once your 
              account has been approved.
            </p>
            
            <div className="mt-6 space-y-3">
              <p className="text-xs text-gray-400">
                Have questions? Contact us at{' '}
                <a href="mailto:dealers@ironscout.ai" className="text-gray-600 hover:underline">
                  dealers@ironscout.ai
                </a>
              </p>
              
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
  );
}
