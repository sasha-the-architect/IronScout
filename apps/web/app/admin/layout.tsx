import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { BRAND_NAME } from '@/lib/brand'

// Admin emails from environment variable
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // Require authentication for admin
  if (!session) {
    redirect('/auth/signin?callbackUrl=/admin')
  }

  // Check if user is an admin
  const userEmail = session.user?.email?.toLowerCase()
  const isAdmin = userEmail && ADMIN_EMAILS.includes(userEmail)

  if (!isAdmin) {
    redirect('/?error=unauthorized')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-8">
              <Link href="/admin" className="flex items-center space-x-2">
                <Image
                  src="/logo-dark.svg"
                  alt="IronScout"
                  width={24}
                  height={24}
                  className="flex-shrink-0"
                />
                <span className="text-xl font-bold text-gray-900">{BRAND_NAME} Admin</span>
              </Link>
              <nav className="hidden md:flex space-x-4">
                <Link
                  href="/admin"
                  className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Dashboard
                </Link>
                <Link
                  href="/admin/sources"
                  className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Sources
                </Link>
                <Link
                  href="/admin/executions"
                  className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Executions
                </Link>
                <Link
                  href="/admin/logs"
                  className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Logs
                </Link>
                <Link
                  href="/admin/embeddings"
                  className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  AI Search
                </Link>
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{session.user?.email}</span>
              <Link
                href="/"
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Back to Site
              </Link>
            </div>
          </div>
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
