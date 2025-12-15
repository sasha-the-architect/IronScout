'use client';

import { useState } from 'react';
import { Rss, Play, Clock, AlertCircle, CheckCircle, XCircle, SkipForward } from 'lucide-react';
import { triggerManualFeedRun } from './actions';

interface FeedRun {
  id: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  rowCount: number;
  indexedCount: number;
  quarantinedCount: number;
  rejectedCount: number;
  primaryErrorCode: string | null;
}

interface Feed {
  id: string;
  name: string | null;
  accessType: string;
  formatType: string;
  url: string | null;
  status: string;
  enabled: boolean;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

interface FeedsSectionProps {
  dealerId: string;
  feeds: Feed[];
  subscriptionStatus: string;
}

function formatDateTime(date: Date | null): string {
  if (!date) return 'Never';
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'HEALTHY':
      return { color: 'bg-green-100 text-green-700', icon: CheckCircle };
    case 'WARNING':
      return { color: 'bg-yellow-100 text-yellow-700', icon: AlertCircle };
    case 'FAILED':
      return { color: 'bg-red-100 text-red-700', icon: XCircle };
    case 'PENDING':
      return { color: 'bg-gray-100 text-gray-700', icon: Clock };
    default:
      return { color: 'bg-gray-100 text-gray-700', icon: Clock };
  }
}

export function FeedsSection({ dealerId, feeds, subscriptionStatus }: FeedsSectionProps) {
  const [triggeringFeed, setTriggeringFeed] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isSubscriptionExpired = subscriptionStatus === 'EXPIRED' || subscriptionStatus === 'SUSPENDED';

  async function handleTriggerFeed(feedId: string) {
    setTriggeringFeed(feedId);
    setMessage(null);

    try {
      const result = await triggerManualFeedRun(dealerId, feedId);
      if (result.success) {
        setMessage({
          type: 'success',
          text: result.message || 'Feed run triggered successfully.',
        });
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'Failed to trigger feed run.',
        });
      }
    } catch {
      setMessage({
        type: 'error',
        text: 'An unexpected error occurred.',
      });
    } finally {
      setTriggeringFeed(null);
    }
  }

  if (feeds.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Feeds</h2>
        <p className="text-gray-500 text-sm">No feeds configured for this dealer.</p>
      </div>
    );
  }

  return (
    <div id="feeds" className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-900">Feeds</h2>
        {isSubscriptionExpired && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            <SkipForward className="h-3.5 w-3.5" />
            Subscription {subscriptionStatus.toLowerCase()} - feeds skipped
          </span>
        )}
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Feed
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Last Success
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {feeds.map((feed) => {
              const statusBadge = getStatusBadge(feed.status);
              const StatusIcon = statusBadge.icon;

              return (
                <tr key={feed.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Rss className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {feed.name || 'Unnamed Feed'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {feed.accessType} / {feed.formatType}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${statusBadge.color}`}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {feed.status}
                    </span>
                    {!feed.enabled && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDateTime(feed.lastSuccessAt)}
                    {feed.lastError && (
                      <p className="text-xs text-red-600 mt-1 max-w-xs truncate" title={feed.lastError}>
                        {feed.lastError}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleTriggerFeed(feed.id)}
                      disabled={triggeringFeed === feed.id || !feed.url}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                        triggeringFeed === feed.id
                          ? 'bg-gray-100 text-gray-400 cursor-wait'
                          : !feed.url
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : isSubscriptionExpired
                              ? 'bg-amber-600 text-white hover:bg-amber-700'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                      title={
                        !feed.url
                          ? 'Feed URL not configured'
                          : isSubscriptionExpired
                            ? 'Run feed with admin override (bypasses subscription check)'
                            : 'Trigger feed run now'
                      }
                    >
                      {triggeringFeed === feed.id ? (
                        <>
                          <span className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3" />
                          {isSubscriptionExpired ? 'Run (Override)' : 'Run Now'}
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isSubscriptionExpired && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            <strong>Note:</strong> This dealer&apos;s subscription has {subscriptionStatus.toLowerCase()}.
            Automatic feed processing is paused. Use &quot;Run (Override)&quot; to manually trigger a feed
            run, bypassing the subscription check. This action will be logged for audit purposes.
          </p>
        </div>
      )}
    </div>
  );
}
