import { prisma } from '@ironscout/db';
import Link from 'next/link';
import {
  Rss,
  Clock,
  CheckCircle,
  XCircle,
  PauseCircle,
  FileText,
  AlertTriangle,
  Plus,
} from 'lucide-react';
import { FeedActions } from './feed-actions';

export const dynamic = 'force-dynamic';

const statusConfig = {
  DRAFT: { label: 'Draft', color: 'bg-amber-100 text-amber-800 ring-1 ring-amber-400', icon: FileText },
  ENABLED: { label: 'Enabled', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  PAUSED: { label: 'Paused', color: 'bg-yellow-100 text-yellow-700', icon: PauseCircle },
  DISABLED: { label: 'Disabled', color: 'bg-red-100 text-red-700', icon: XCircle },
};

const runStatusConfig = {
  RUNNING: { label: 'Running', color: 'text-blue-600' },
  SUCCEEDED: { label: 'Success', color: 'text-green-600' },
  FAILED: { label: 'Failed', color: 'text-red-600' },
  SKIPPED: { label: 'Skipped', color: 'text-gray-500' },
};

export default async function AffiliateFeedsPage() {
  const feeds = await prisma.affiliateFeed.findMany({
    orderBy: [
      { status: 'asc' },
      { createdAt: 'desc' },
    ],
    include: {
      source: {
        include: { retailer: true },
      },
      runs: {
        orderBy: { startedAt: 'desc' },
        take: 1,
      },
    },
  });

  const draftCount = feeds.filter(f => f.status === 'DRAFT').length;
  const enabledCount = feeds.filter(f => f.status === 'ENABLED').length;
  const disabledCount = feeds.filter(f => f.status === 'DISABLED').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Affiliate Feeds</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage automated product catalog ingestion from affiliate networks
          </p>
        </div>
        <Link
          href="/affiliate-feeds/create"
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Feed
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Rss className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Feeds</dt>
                  <dd className="text-lg font-semibold text-gray-900">{feeds.length}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle className="h-6 w-6 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Enabled</dt>
                  <dd className="text-lg font-semibold text-gray-900">{enabledCount}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <FileText className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Draft</dt>
                  <dd className="text-lg font-semibold text-gray-900">{draftCount}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <XCircle className="h-6 w-6 text-red-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Disabled</dt>
                  <dd className="text-lg font-semibold text-gray-900">{disabledCount}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Draft feeds alert */}
      {draftCount > 0 && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-4">
          <div className="flex">
            <FileText className="h-5 w-5 text-amber-500" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-amber-800">
                {draftCount} feed{draftCount !== 1 ? 's' : ''} in draft mode
              </h3>
              <p className="mt-1 text-sm text-amber-700">
                Draft feeds won't run until enabled. Test the connection, then click "Enable" to activate.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Disabled feeds alert */}
      {disabledCount > 0 && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                {disabledCount} feed{disabledCount !== 1 ? 's' : ''} auto-disabled
              </h3>
              <p className="mt-1 text-sm text-red-700">
                These feeds have been disabled after consecutive failures. Review and re-enable when issues are resolved.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Feeds Table */}
      <div className="bg-white shadow rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Source / Retailer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Transport
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Schedule
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Run
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Next Run
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {feeds.map((feed) => {
              const status = statusConfig[feed.status];
              const StatusIcon = status.icon;
              const lastRun = feed.runs[0];
              const lastRunStatus = lastRun ? runStatusConfig[lastRun.status] : null;

              const rowBgClass = feed.status === 'DISABLED'
                ? 'bg-red-50'
                : feed.status === 'DRAFT'
                  ? 'bg-amber-50/50'
                  : '';

              return (
                <tr key={feed.id} className={rowBgClass}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link href={`/affiliate-feeds/${feed.id}`} className="hover:underline">
                      <div className="text-sm font-medium text-gray-900">
                        {feed.source.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {feed.source.retailer?.name || 'No retailer'}
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </span>
                    {feed.consecutiveFailures > 0 && feed.status !== 'DISABLED' && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                        {feed.consecutiveFailures} failures
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {feed.transport}
                    </div>
                    <div className="text-sm text-gray-500">
                      {feed.host}:{feed.port}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {feed.scheduleFrequencyHours ? (
                      <div className="flex items-center gap-1 text-sm text-gray-900">
                        <Clock className="h-3.5 w-3.5" />
                        Every {feed.scheduleFrequencyHours}h
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">Manual only</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {lastRun ? (
                      <div>
                        <span className={`text-sm ${lastRunStatus?.color || 'text-gray-500'}`}>
                          {lastRunStatus?.label}
                        </span>
                        <div className="text-xs text-gray-500">
                          {new Date(lastRun.startedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Never</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {feed.nextRunAt ? (
                      <div className="text-sm text-gray-900">
                        {new Date(feed.nextRunAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    ) : feed.manualRunPending ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                        Pending
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <FeedActions
                      feed={{
                        id: feed.id,
                        status: feed.status,
                        manualRunPending: feed.manualRunPending,
                      }}
                    />
                  </td>
                </tr>
              );
            })}

            {feeds.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  No affiliate feeds configured yet.{' '}
                  <Link href="/affiliate-feeds/create" className="text-blue-600 hover:underline">
                    Add your first feed
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
