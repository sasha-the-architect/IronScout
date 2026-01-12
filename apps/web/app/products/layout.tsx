import { auth } from '@/lib/auth'
import { SidebarNav } from '@/components/layout/sidebar-nav'

export default async function ProductsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // If not authenticated, show without sidebar (public access)
  if (!session) {
    return <>{children}</>
  }

  const userName = session.user?.name || session.user?.email || 'User'

  return (
    <>
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
    </>
  )
}
