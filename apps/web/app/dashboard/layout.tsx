import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { SearchLoadingProvider } from '@/components/search/search-loading-context'

export const metadata: Metadata = {
  title: {
    template: '%s - IronScout',
    default: 'My Loadout - IronScout',
  },
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) {
    redirect('/api/auth/signin')
  }

  const userName = session.user?.name || session.user?.email || 'User'

  return (
    <SearchLoadingProvider>
      {/* Hide parent header/footer and take over the full viewport */}
      <style>{`
        body > div > header,
        body > div > footer {
          display: none !important;
        }
        body > div > main {
          flex: none !important;
        }
      `}</style>

      <div className="fixed inset-0 bg-background">
        <SidebarNav userName={userName} />

        {/* Main content area - offset for sidebar on desktop */}
        <div className="lg:pl-64 h-full overflow-auto">
          {/* Header spacer for mobile menu button */}
          <div className="lg:hidden h-16" />

          <main className="min-h-full">
            {children}
          </main>
        </div>
      </div>
    </SearchLoadingProvider>
  )
}
