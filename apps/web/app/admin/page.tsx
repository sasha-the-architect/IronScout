import Link from 'next/link'
import { Card } from '@/components/ui/card'
import DashboardStats from '@/components/admin/DashboardStats'
import RecentExecutions from '@/components/admin/RecentExecutions'

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <Link
          href="/admin/sources?action=trigger"
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
        >
          Trigger Crawl
        </Link>
      </div>

      {/* Stats Grid */}
      <DashboardStats />

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/admin/sources">
          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Manage Sources</h3>
            <p className="text-gray-600">Add, edit, or disable crawl sources</p>
          </Card>
        </Link>

        <Link href="/admin/executions">
          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">View Executions</h3>
            <p className="text-gray-600">Monitor crawl job runs and status</p>
          </Card>
        </Link>

        <Link href="/admin/logs">
          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Execution Logs</h3>
            <p className="text-gray-600">Search and filter detailed logs</p>
          </Card>
        </Link>
      </div>

      {/* Recent Activity */}
      <RecentExecutions />
    </div>
  )
}
