import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { AlertsManager } from '@/components/dashboard/alerts-manager'

export default async function AlertsPage() {
  const session = await getServerSession()

  if (!session) {
    redirect('/api/auth/signin')
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">My Alerts</h1>
        <p className="text-muted-foreground mt-2">
          Manage your price tracking alerts and get notified when prices drop
        </p>
      </div>

      <AlertsManager />
    </div>
  )
}
