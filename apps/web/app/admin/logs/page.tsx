'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface Log {
  id: string
  executionId: string
  level: string
  event: string
  message: string
  metadata?: any
  timestamp: string
  execution: {
    source: {
      name: string
    }
  }
}

function LogsContent() {
  const searchParams = useSearchParams()
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [levelFilter, setLevelFilter] = useState<string>(searchParams.get('level') || '')
  const [eventFilter, setEventFilter] = useState<string>(searchParams.get('event') || '')
  const [executionIdFilter, setExecutionIdFilter] = useState<string>(searchParams.get('executionId') || '')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [events, setEvents] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    fetchEvents()
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [page, levelFilter, eventFilter, executionIdFilter, searchQuery])

  async function fetchEvents() {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/logs/events`)
      const data = await response.json()
      setEvents(data)
    } catch (error) {
      console.error('Error fetching events:', error)
    }
  }

  async function fetchLogs() {
    setLoading(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      })
      if (levelFilter) params.append('level', levelFilter)
      if (eventFilter) params.append('event', eventFilter)
      if (executionIdFilter) params.append('executionId', executionIdFilter)
      if (searchQuery) params.append('search', searchQuery)

      const response = await fetch(`${apiUrl}/api/logs?${params}`)
      const data = await response.json()
      setLogs(data.logs)
      setTotalPages(data.pagination.totalPages)
    } catch (error) {
      console.error('Error fetching logs:', error)
    } finally {
      setLoading(false)
    }
  }

  function getLevelBadge(level: string) {
    const colors = {
      INFO: 'bg-blue-100 text-blue-800',
      WARN: 'bg-yellow-100 text-yellow-800',
      ERROR: 'bg-red-100 text-red-800',
    }
    return colors[level as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Execution Logs</h1>
        <Button onClick={() => fetchLogs()} className="bg-blue-600 hover:bg-blue-700">
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
            <select
              value={levelFilter}
              onChange={(e) => { setLevelFilter(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Levels</option>
              <option value="INFO">Info</option>
              <option value="WARN">Warning</option>
              <option value="ERROR">Error</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event</label>
            <select
              value={eventFilter}
              onChange={(e) => { setEventFilter(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Events</option>
              {events.map((event) => (
                <option key={event} value={event}>{event}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Message</label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search in messages..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button onClick={() => setPage(1)} className="bg-blue-600 hover:bg-blue-700">
                Search
              </Button>
            </div>
          </div>
        </div>

        {executionIdFilter && (
          <div className="mt-4 flex items-center space-x-2">
            <span className="text-sm text-gray-600">Filtered by execution:</span>
            <Badge className="bg-purple-100 text-purple-800">{executionIdFilter}</Badge>
            <button
              onClick={() => { setExecutionIdFilter(''); setPage(1) }}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Clear
            </button>
          </div>
        )}
      </Card>

      {/* Logs */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded"></div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-gray-600">No logs found matching your filters.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <Card key={log.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start space-x-3">
                <Badge className={getLevelBadge(log.level)}>
                  {log.level}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-sm font-medium text-gray-900">{log.event}</span>
                    <span className="text-xs text-gray-500">•</span>
                    <span className="text-xs text-gray-500">{log.execution.source.name}</span>
                    <span className="text-xs text-gray-500">•</span>
                    <span className="text-xs text-gray-500">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{log.message}</p>
                  {log.metadata && (
                    <details className="mt-2">
                      <summary className="text-xs text-blue-600 cursor-pointer">View Metadata</summary>
                      <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
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

export default function LogsPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Execution Logs</h1>
        </div>
        <div className="animate-pulse space-y-3">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    }>
      <LogsContent />
    </Suspense>
  )
}
