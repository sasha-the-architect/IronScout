'use client';

import { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface EmbeddingStats {
  totalProducts: number;
  productsWithEmbedding: number;
  productsWithoutEmbedding: number;
  coveragePercent: number;
  backfillInProgress: boolean;
  backfillProgress: {
    processed: number;
    total: number;
    errors: string[];
  } | null;
  queueStats?: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
}

export function EmbeddingsSettings() {
  const [stats, setStats] = useState<EmbeddingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/search/admin/embedding-stats', {
        headers: {
          'X-Admin-Key': process.env.NEXT_PUBLIC_ADMIN_API_KEY || '',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Faster polling when processing
  useEffect(() => {
    if (!stats?.backfillInProgress) return;

    const interval = setInterval(() => {
      fetchStats();
    }, 2000); // Poll every 2 seconds while processing

    return () => clearInterval(interval);
  }, [stats?.backfillInProgress]);

  const triggerBackfill = async () => {
    setTriggering(true);
    setError(null);

    try {
      const response = await fetch('/api/search/admin/backfill-embeddings', {
        method: 'POST',
        headers: {
          'X-Admin-Key': process.env.NEXT_PUBLIC_ADMIN_API_KEY || '',
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to trigger backfill');
      }

      // Refresh stats to show progress
      await fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger backfill');
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {stats && (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{stats.totalProducts}</div>
              <div className="text-sm text-gray-600">Total Products</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-700">{stats.productsWithEmbedding}</div>
              <div className="text-sm text-green-600">With Embedding</div>
            </div>
            <div className="bg-amber-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-amber-700">{stats.productsWithoutEmbedding}</div>
              <div className="text-sm text-amber-600">Missing Embedding</div>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-700">{stats.coveragePercent}%</div>
              <div className="text-sm text-blue-600">Coverage</div>
            </div>
          </div>

          {/* Backfill Progress */}
          {stats.backfillInProgress && stats.queueStats && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span className="font-medium text-blue-900">Generating Embeddings</span>
              </div>
              <div className="relative pt-1">
                <div className="flex mb-2 items-center justify-between">
                  <div className="text-xs text-blue-600">
                    {stats.queueStats.completed} completed
                  </div>
                  <div className="text-xs text-blue-600">
                    {stats.backfillProgress && stats.backfillProgress.total > 0
                      ? Math.round((stats.queueStats.completed / stats.backfillProgress.total) * 100)
                      : 0}%
                  </div>
                </div>
                <div className="overflow-hidden h-2 text-xs flex rounded bg-blue-200">
                  <div
                    style={{
                      width: `${stats.backfillProgress && stats.backfillProgress.total > 0
                        ? (stats.queueStats.completed / stats.backfillProgress.total) * 100
                        : 0}%`
                    }}
                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-600 transition-all duration-500"
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs">
                <span className="text-blue-700">
                  <span className="font-medium">{stats.queueStats.active}</span> active
                </span>
                <span className="text-blue-600">
                  <span className="font-medium">{stats.queueStats.waiting}</span> waiting
                </span>
                {stats.queueStats.failed > 0 && (
                  <span className="text-red-600">
                    <span className="font-medium">{stats.queueStats.failed}</span> failed
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Backfill Complete */}
          {!stats.backfillInProgress && stats.productsWithoutEmbedding === 0 && stats.totalProducts > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-green-800">All products have embeddings</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={triggerBackfill}
              disabled={triggering || stats.backfillInProgress || stats.productsWithoutEmbedding === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {triggering ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {stats.backfillInProgress
                ? 'Backfill Running...'
                : stats.productsWithoutEmbedding === 0
                  ? 'All Embeddings Complete'
                  : `Generate ${stats.productsWithoutEmbedding} Embeddings`}
            </button>

            <button
              onClick={fetchStats}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Info */}
          <p className="text-xs text-gray-500 pt-2">
            Embeddings enable semantic search. Products without embeddings fall back to keyword matching.
            Enable &quot;Auto Embedding&quot; in Feature Flags to automatically generate embeddings when products are resolved.
          </p>
        </>
      )}
    </div>
  );
}
