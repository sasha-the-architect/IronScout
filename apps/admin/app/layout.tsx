import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { getAdminSession } from '@/lib/auth';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Navigation } from '@/components/navigation';

// Force dynamic rendering - required for cookie access
export const dynamic = 'force-dynamic';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'IronScout Admin',
  description: 'IronScout Administration Portal',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();

  // If not logged in as admin, redirect to admin's own login page
  if (!session) {
    const loginUrl = '/auth/signin';

    return (
      <html lang="en">
        <body className={inter.className}>
          <div className="min-h-screen bg-gray-100 flex items-center justify-center">
            <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
              <div className="flex justify-center mb-4">
                <Image
                  src="/logo-dark.svg"
                  alt="IronScout"
                  width={48}
                  height={48}
                />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin Access Required</h1>
              <p className="text-gray-600 mb-6">
                Redirecting to login...
              </p>
              <a
                href={loginUrl}
                className="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-800"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Log In with Google
              </a>
              <p className="mt-4 text-sm text-gray-500">
                Only authorized admin accounts can access this portal.
              </p>
              {/* Auto-redirect script */}
              <script
                dangerouslySetInnerHTML={{
                  __html: `setTimeout(function() { window.location.href = "${loginUrl}"; }, 1500);`,
                }}
              />
            </div>
          </div>
        </body>
      </html>
    );
  }
  
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-100 flex">
          <Navigation admin={session} />
          <main className="flex-1 overflow-auto p-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
