import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth';
import { Shield, Users, BarChart3, Settings, LogOut, Loader2 } from 'lucide-react';
import Link from 'next/link';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'IronScout Admin',
  description: 'IronScout Administration Portal',
};

async function AdminNav() {
  const session = await getAdminSession();
  
  if (!session) {
    return null;
  }
  
  return (
    <nav className="bg-gray-900 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg">
              <Shield className="h-6 w-6" />
              IronScout Admin
            </Link>
            
            <div className="hidden md:flex items-center gap-1">
              <Link
                href="/dealers"
                className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-800 flex items-center gap-2"
              >
                <Users className="h-4 w-4" />
                Dealers
              </Link>
              <Link
                href="/analytics"
                className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-800 flex items-center gap-2"
              >
                <BarChart3 className="h-4 w-4" />
                Analytics
              </Link>
              <Link
                href="/settings"
                className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-800 flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-300">{session.email}</span>
            <a
              href={process.env.NEXT_PUBLIC_WEB_URL || 'https://ironscout.ai'}
              className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
            >
              <LogOut className="h-4 w-4" />
              Exit Admin
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  
  // If not logged in as admin, redirect to main site login
  if (!session) {
    const webUrl = process.env.NEXT_PUBLIC_WEB_URL || 'https://ironscout.ai';
    const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.ironscout.ai';
    const loginUrl = `${webUrl}/auth/signin?callbackUrl=${encodeURIComponent(adminUrl)}`;
    
    return (
      <html lang="en">
        <body className={inter.className}>
          <div className="min-h-screen bg-gray-100 flex items-center justify-center">
            <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
              <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
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
        <div className="min-h-screen bg-gray-100">
          <AdminNav />
          <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
