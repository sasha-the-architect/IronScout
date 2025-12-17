import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth';
import { Shield, Users, BarChart3, Settings, LogOut, Loader2 } from 'lucide-react';
import Link from 'next/link';

// Force dynamic rendering - required for cookie access
export const dynamic = 'force-dynamic';

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
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
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
              href="/api/auth/logout"
              className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
            >
              <LogOut className="h-4 w-4" />
              Logout
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
  
  // If not logged in as admin, redirect to local login page
  if (!session) {
    redirect('/auth/signin');
  }
  
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-100">
          <AdminNav />
          <main className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
