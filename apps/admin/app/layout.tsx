import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth';
import { Navigation } from '@/components/navigation';
import { Toaster } from 'sonner';

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
  // Get current path to allow auth routes without session
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || headersList.get('x-invoke-path') || '';
  const isAuthRoute = pathname.startsWith('/auth') || pathname.startsWith('/api/auth');

  // Auth routes don't require session - render children directly
  if (isAuthRoute) {
    return (
      <html lang="en">
        <body className={inter.className}>
          {children}
        </body>
      </html>
    );
  }

  const session = await getAdminSession();

  // If not logged in as admin, redirect to signin page
  if (!session) {
    redirect('/auth/signin');
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
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
