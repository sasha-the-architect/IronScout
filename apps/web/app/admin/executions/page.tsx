'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createLogger } from '@/lib/logger'

const logger = createLogger('app:admin:executions')

interface Execution {
  id: string
  sourceId: string
  status: string
  startedAt: string
  completedAt?: string
  duration?: number
  itemsFound: number
  itemsUpserted: number
  errorMessage?: string
  source: {
    name: string
  }
  _count: {
    logs: number
  }
}

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<Execution[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    fetchExecutions()
  }, [page, statusFilter])

  async function fetchExecutions() {
    setLoading(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      })
      if (statusFilter) params.append('status', statusFilter)

      const response = await fetch(`${apiUrl}/api/executions?${params}`)
      const data = await response.json()
      setExecutions(data.executions)
      setTotalPages(data.pagination.totalPages)
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Executions</h1>
        <Button onClick={() => window.location.reload()} className="bg-blue-600 hover:bg-blue-700">
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center space-x-4">
          <label className="text-sm font-medium text-gray-700">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="RUNNING">Running</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
      </Card>

      {/* Executions Table */}
      {loading ? (
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-200 rounded"></div>
          ))}
        </div>
      ) : executions.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-gray-600">No executions found.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Items Found
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Items Upserted
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Started
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {executions.map((execution) => (
                  <tr key={execution.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{execution.source.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge className={getStatusBadge(execution.status)}>
                        {execution.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {execution.itemsFound}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {execution.itemsUpserted}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDuration(execution.duration)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(execution.startedAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Link
                        href={`/admin/logs?executionId=${execution.id}`}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        View Logs ({execution._count.logs})
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center space-x-2">
          <Button
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
            className="bg-gray-600 hover:bg-gray-700"
          >
            Previous
          </Button>
          <span className="px-4 py-2 text-sm text-gray-700">
            Page {page} of {totalPages}
          </span>
          <Button
            onClick={() => setPage(page + 1)}
            disabled={page === totalPages}
            className="bg-gray-600 hover:bg-gray-700"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
