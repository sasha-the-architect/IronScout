'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Database,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Sparkles,
  Search
} from 'lucide-react'
import { createLogger } from '@/lib/logger'

const logger = createLogger('admin-embeddings')

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface EmbeddingStats {
  total: number
  withEmbedding: number
  withoutEmbedding: number
  percentComplete: number
}

interface BackfillProgress {
  inProgress: boolean
  processed: number
  total: number
  errors: string[]
  percentComplete: number
}

export default function EmbeddingsAdminPage() {
  const [stats, setStats] = useState<EmbeddingStats | null>(null)
  const [progress, setProgress] = useState<BackfillProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [backfillStarting, setBackfillStarting] = useState(false)
  
  // Test search state
  const [testQuery, setTestQuery] = useState('')
  const [testResult, setTestResult] = useState<any>(null)
  const [testLoading, setTestLoading] = useState(false)

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/search/admin/embedding-stats`, {
        headers: {
          'X-Admin-Key': getAdminKey(),
        },
      })
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized - Check your admin API key')
        }
        throw new Error('Failed to fetch stats')
      }
      
      const data = await response.json()
      setStats(data)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    }
  }, [])

  const fetchProgress = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/search/admin/backfill-progress`, {
        headers: {
          'X-Admin-Key': getAdminKey(),
        },
      })
      
      if (response.ok) {
        const data = await response.json()
        setProgress(data)
        return data.inProgress
      }
    } catch (err) {
      // Ignore progress fetch errors
    }
    return false
  }, [])

  const startBackfill = async () => {
    setBackfillStarting(true)
    setError(null)
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/search/admin/backfill-embeddings`, {
        method: 'POST',
        headers: {
          'X-Admin-Key': getAdminKey(),
        },
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to start backfill')
      }
      
      // Start polling for progress
      pollProgress()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBackfillStarting(false)
    }
  }

  const pollProgress = useCallback(async () => {
    const isRunning = await fetchProgress()
    
    if (isRunning) {
      setTimeout(pollProgress, 2000)
    } else {
      // Backfill complete, refresh stats
      fetchStats()
    }
  }, [fetchProgress, fetchStats])

  const testSearch = async () => {
    if (!testQuery.trim()) return
    
    setTestLoading(true)
    setTestResult(null)
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/search/semantic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: testQuery, limit: 5 }),
      })
      
      if (response.ok) {
        const data = await response.json()
        setTestResult(data)
      }
    } catch (err) {
      logger.error('Test search failed', {}, err)
    } finally {
      setTestLoading(false)
    }
  }

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await fetchStats()
      await fetchProgress()
      setLoading(false)
    }
    
    init()
  }, [fetchStats, fetchProgress])

  // Poll progress if backfill is running
  useEffect(() => {
    if (progress?.inProgress) {
      const interval = setInterval(async () => {
        const isRunning = await fetchProgress()
        if (!isRunning) {
          clearInterval(interval)
          fetchStats()
        }
      }, 2000)
      
      return () => clearInterval(interval)
    }
  }, [progress?.inProgress, fetchProgress, fetchStats])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI Search & Embeddings</h1>
          <p className="text-gray-600 mt-1">Manage vector embeddings for semantic search</p>
        </div>
        <Button
          onClick={fetchStats}
          variant="outline"
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
          <div>
            <h3 className="font-medium text-red-800">Error</h3>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Database className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Products</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.total || 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">With Embeddings</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.withEmbedding || 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <XCircle className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Missing Embeddings</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.withoutEmbedding || 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Sparkles className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Coverage</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.percentComplete || 0}%</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Progress Bar */}
      {stats && stats.total > 0 && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium text-gray-900">Embedding Coverage</h3>
            <span className="text-sm text-gray-600">
              {stats.withEmbedding} / {stats.total} products
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500"
              style={{ width: `${stats.percentComplete}%` }}
            />
          </div>
        </Card>
      )}

      {/* Backfill Section */}
      <Card className="p-6">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-medium text-gray-900 text-lg">Generate Embeddings</h3>
            <p className="text-gray-600 text-sm mt-1">
              Generate vector embeddings for products that don't have them yet.
              This enables semantic search capabilities.
            </p>
          </div>
          
          <Button
            onClick={startBackfill}
            disabled={backfillStarting || progress?.inProgress || stats?.withoutEmbedding === 0}
            className="flex items-center gap-2"
          >
            {(backfillStarting || progress?.inProgress) ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Embeddings
              </>
            )}
          </Button>
        </div>

        {/* Backfill Progress */}
        {progress?.inProgress && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-blue-900">Backfill in progress...</span>
              <span className="text-sm text-blue-700">
                {progress.processed} / {progress.total} ({progress.percentComplete}%)
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.percentComplete}%` }}
              />
            </div>
            {progress.errors.length > 0 && (
              <p className="text-xs text-red-600 mt-2">
                {progress.errors.length} error(s) occurred
              </p>
            )}
          </div>
        )}

        {/* Completion Message */}
        {!progress?.inProgress && (progress?.processed ?? 0) > 0 && (
          <div className="mt-6 p-4 bg-green-50 rounded-lg flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <span className="font-medium text-green-900">Backfill complete!</span>
              <span className="text-green-700 ml-2">
                Processed {progress?.processed ?? 0} products
              </span>
              {(progress?.errors?.length ?? 0) > 0 && (
                <span className="text-red-600 ml-2">
                  ({progress?.errors?.length ?? 0} errors)
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Test Search */}
      <Card className="p-6">
        <h3 className="font-medium text-gray-900 text-lg mb-4">Test Semantic Search</h3>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && testSearch()}
              placeholder="Try: best ammo for long range AR15 target practice"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Button onClick={testSearch} disabled={testLoading}>
            {testLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Search'
            )}
          </Button>
        </div>

        {/* Search Results */}
        {testResult && (
          <div className="mt-6 space-y-4">
            {/* Intent Analysis */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Query Understanding</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {testResult.intent.calibers?.length > 0 && (
                  <div>
                    <span className="text-gray-500">Caliber:</span>
                    <span className="ml-2 font-medium">{testResult.intent.calibers.join(', ')}</span>
                  </div>
                )}
                {testResult.intent.purpose && (
                  <div>
                    <span className="text-gray-500">Purpose:</span>
                    <span className="ml-2 font-medium">{testResult.intent.purpose}</span>
                  </div>
                )}
                {testResult.intent.grainWeights?.length > 0 && (
                  <div>
                    <span className="text-gray-500">Grain:</span>
                    <span className="ml-2 font-medium">{testResult.intent.grainWeights.join(', ')}gr</span>
                  </div>
                )}
                {testResult.intent.qualityLevel && (
                  <div>
                    <span className="text-gray-500">Quality:</span>
                    <span className="ml-2 font-medium">{testResult.intent.qualityLevel}</span>
                  </div>
                )}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Confidence: {Math.round(testResult.intent.confidence * 100)}% | 
                Vector Search: {testResult.searchMetadata.vectorSearchUsed ? '✓' : '✗'} |
                Time: {testResult.searchMetadata.processingTimeMs}ms
              </div>
            </div>

            {/* Results */}
            <div>
              <h4 className="font-medium text-gray-900 mb-2">
                Results ({testResult.pagination.total} found)
              </h4>
              <div className="space-y-2">
                {testResult.products.slice(0, 5).map((product: any) => (
                  <div
                    key={product.id}
                    className="p-3 bg-white border rounded-lg flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-500">
                        {product.caliber} | {product.purpose} | {product.grainWeight}gr
                      </p>
                    </div>
                    <div className="text-right">
                      {product.relevanceScore !== undefined && (
                        <span className="text-sm text-purple-600 font-medium">
                          Score: {product.relevanceScore}
                        </span>
                      )}
                      {product.prices?.[0] && (
                        <p className="text-sm text-green-600">
                          ${product.prices[0].price}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Info Section */}
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-purple-50">
        <h3 className="font-medium text-gray-900 text-lg mb-3">How It Works</h3>
        <div className="grid md:grid-cols-3 gap-6 text-sm text-gray-700">
          <div>
            <h4 className="font-medium text-gray-900 mb-1">1. Embedding Generation</h4>
            <p>
              Each product is converted into a 1536-dimensional vector using OpenAI's 
              embedding model. This captures semantic meaning.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-1">2. Vector Storage</h4>
            <p>
              Embeddings are stored in PostgreSQL using pgvector with an HNSW index 
              for fast similarity search.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-1">3. Semantic Search</h4>
            <p>
              User queries are embedded and compared against product vectors to find 
              conceptually similar matches.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

/**
 * Get admin API key from localStorage or prompt user
 */
function getAdminKey(): string {
  if (typeof window === 'undefined') return ''
  
  let key = localStorage.getItem('ironscout_admin_key')
  
  if (!key) {
    key = prompt('Enter Admin API Key:')
    if (key) {
      localStorage.setItem('ironscout_admin_key', key)
    }
  }
  
  return key || ''
}
