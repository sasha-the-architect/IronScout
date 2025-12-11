import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { ImpersonationBanner } from '@/components/impersonation-banner';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  
  if (!session) {
    redirect('/login');
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Impersonation Banner */}
      <ImpersonationBanner />
      
      {/* Sidebar */}
      <Sidebar session={session} />
      
      {/* Main content */}
      <div className="lg:pl-64">
        <Header session={session} />
        
        <main className="py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
