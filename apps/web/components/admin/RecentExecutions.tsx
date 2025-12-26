'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createLogger } from '@/lib/logger'

const logger = createLogger('components:admin:recent-executions')

interface Execution {
  id: string
  sourceId: string
  status: string
  startedAt: string
  completedAt?: string
  duration?: number
  itemsFound: number
  itemsUpserted: number
  source: {
    name: string
  }
}

export default function RecentExecutions() {
  const [executions, setExecutions] = useState<Execution[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchExecutions()
  }, [])

  async function fetchExecutions() {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/executions?limit=10`)
      const data = await response.json()
      setExecutions(data.executions)
    } catch (error) {
      logger.error('Error fetching executions', {}, error)
    } finally {
      setLoading(false)
    }
  }

  function getStatusBadge(status: string) {
    const colors = {
      SUCCESS: 'bg-green-100 text-green-800',
      FAILED: 'bg-red-100 text-red-800',
      RUNNING: 'bg-blue-100 text-blue-800',
      PENDING: 'bg-yellow-100 text-yellow-800',
    }
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  function formatDuration(ms?: number) {
    if (!ms) return '-'
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m ${seconds % 60}s`
  }

  if (loading) {
    return (
      <Card className="p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Executions</h2>
        <div className="animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded"></div>
          ))}
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-900">Recent Executions</h2>
        <Link href="/admin/executions" className="text-blue-600 hover:text-blue-700 text-sm">
          View All →
        </Link>
      </div>

      {executions.length === 0 ? (
        <p className="text-gray-600">No executions yet. Trigger a crawl to get started.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Started
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {executions.map((execution) => (
                <tr key={execution.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link
                      href={`/admin/executions/${execution.id}`}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      {execution.source.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge className={getStatusBadge(execution.status)}>
                      {execution.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {execution.itemsUpserted} / {execution.itemsFound}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {formatDuration(execution.duration)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {new Date(execution.startedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
