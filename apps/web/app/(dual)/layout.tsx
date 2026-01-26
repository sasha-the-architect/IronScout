import { auth } from '@/lib/auth'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { SearchLoadingProvider } from '@/components/search/search-loading-context'

export default async function DualLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // Logged in → sidebar experience (stays in app)
  if (session) {
    const userName = session.user?.name || session.user?.email || 'User'

    return (
      <SearchLoadingProvider>
        <div className="fixed inset-0 bg-background">
          <SidebarNav userName={userName} />

          {/* Main content area - offset for sidebar on desktop */}
          <div className="lg:pl-64 h-full overflow-auto">
            {/* Header spacer for mobile menu button */}
            <div className="lg:hidden h-16" />

            <main className="min-h-full">{children}</main>
          </div>
        </div>
      </SearchLoadingProvider>
    )
  }

  // Public → marketing experience
  return (
    <SearchLoadingProvider>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </SearchLoadingProvider>
  )
}
