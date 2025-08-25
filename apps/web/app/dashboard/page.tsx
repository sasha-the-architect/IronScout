import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { DashboardOverview } from '@/components/dashboard/dashboard-overview'
import { RecentAlerts } from '@/components/dashboard/recent-alerts'
import { QuickActions } from '@/components/dashboard/quick-actions'

export default async function DashboardPage() {
  const session = await getServerSession()
  
  if (!session) {
    redirect('/api/auth/signin')
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome back! Here's what's happening with your alerts and searches.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DashboardOverview />
          <RecentAlerts />
        </div>
        <div className="space-y-6">
          <QuickActions />
        </div>
      </div>
    </div>
  )
}
