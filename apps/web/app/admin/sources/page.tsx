'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createLogger } from '@/lib/logger'

const logger = createLogger('app:admin:sources')

interface Source {
  id: string
  name: string
  url: string
  type: string
  enabled: boolean
  interval: number
  lastRunAt?: string
  _count: {
    executions: number
  }
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    fetchSources()
  }, [])

  async function fetchSources() {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/sources`)
      const data = await response.json()
      setSources(data)
    } catch (error) {
      logger.error('Error fetching sources', {}, error)
    } finally {
      setLoading(false)
    }
  }

  async function toggleSource(id: string) {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/sources/${id}/toggle`, {
        method: 'POST',
      })
      if (response.ok) {
        fetchSources()
      }
    } catch (error) {
      logger.error('Error toggling source', {}, error)
    }
  }

  async function deleteSource(id: string) {
    if (!confirm('Are you sure you want to delete this source?')) return

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/sources/${id}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        fetchSources()
      }
    } catch (error) {
      logger.error('Error deleting source', {}, error)
    }
  }

  async function triggerCrawl(sourceId?: string) {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/harvester/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sourceId ? { sourceId } : {}),
      })
      if (response.ok) {
        const data = await response.json()
        alert(data.message)
        fetchSources()
      }
    } catch (error) {
      logger.error('Error triggering crawl', {}, error)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Sources</h1>
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Sources</h1>
        <div className="space-x-2">
          <Button onClick={() => triggerCrawl()} className="bg-blue-600 hover:bg-blue-700">
            Trigger All
          </Button>
          <Button onClick={() => setShowAddForm(!showAddForm)} className="bg-green-600 hover:bg-green-700">
            Add Source
          </Button>
        </div>
      </div>

      {showAddForm && (
        <Card className="p-6">
          <AddSourceForm onSuccess={() => { setShowAddForm(false); fetchSources() }} />
        </Card>
      )}

      {sources.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-gray-600">No sources configured yet.</p>
          <Button onClick={() => setShowAddForm(true)} className="mt-4 bg-blue-600 hover:bg-blue-700">
            Add Your First Source
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sources.map((source) => (
            <Card key={source.id} className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{source.name}</h3>
                    <Badge className={source.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                      {source.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                    <Badge className="bg-blue-100 text-blue-800">{source.type}</Badge>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{source.url}</p>
                  <div className="flex space-x-4 text-sm text-gray-500">
                    <span>Interval: {source.interval}s</span>
                    <span>Executions: {source._count.executions}</span>
                    {source.lastRunAt && (
                      <span>Last Run: {new Date(source.lastRunAt).toLocaleString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button
                    onClick={() => triggerCrawl(source.id)}
                    disabled={!source.enabled}
                    className="bg-blue-600 hover:bg-blue-700 text-sm"
                  >
                    Run Now
                  </Button>
                  <Button
                    onClick={() => toggleSource(source.id)}
                    className={source.enabled ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'}
                  >
                    {source.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    onClick={() => deleteSource(source.id)}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function AddSourceForm({ onSuccess }: { onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    type: 'HTML',
    enabled: true,
    interval: 3600,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        onSuccess()
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      logger.error('Error creating source', {}, error)
      alert('Failed to create source')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-lg font-semibold">Add New Source</h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Example Electronics Store"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
        <input
          type="url"
          required
          value={formData.url}
          onChange={(e) => setFormData({ ...formData, url: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="https://example.com/products/rss"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
        <select
          value={formData.type}
          onChange={(e) => setFormData({ ...formData, type: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="RSS">RSS Feed</option>
          <option value="HTML">HTML Page</option>
          <option value="JSON">JSON API</option>
          <option value="JS_RENDERED">JavaScript Rendered</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Interval (seconds)</label>
        <input
          type="number"
          required
          min="60"
          value={formData.interval}
          onChange={(e) => setFormData({ ...formData, interval: parseInt(e.target.value) })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="enabled"
          checked={formData.enabled}
          onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
          className="mr-2"
        />
        <label htmlFor="enabled" className="text-sm text-gray-700">Start enabled</label>
      </div>

      <div className="flex space-x-2">
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
          Create Source
        </Button>
        <Button type="button" onClick={onSuccess} className="bg-gray-600 hover:bg-gray-700">
          Cancel
        </Button>
      </div>
    </form>
  )
}
