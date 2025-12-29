import { prisma } from '@ironscout/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  PauseCircle,
  FileText,
  Server,
  AlertTriangle,
  Calendar,
  Download,
  Hash,
} from 'lucide-react';
import { FeedStatusActions } from './feed-status-actions';
import { RunsTable } from './runs-table';

export const dynamic = 'force-dynamic';

const statusConfig = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-700', icon: FileText },
  ENABLED: { label: 'Enabled', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  PAUSED: { label: 'Paused', color: 'bg-yellow-100 text-yellow-700', icon: PauseCircle },
  DISABLED: { label: 'Disabled', color: 'bg-red-100 text-red-700', icon: XCircle },
};

export default async function AffiliateFeedDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const feed = await prisma.affiliateFeed.findUnique({
    where: { id },
    include: {
      source: {
        include: { retailer: true },
      },
      runs: {
        orderBy: { startedAt: 'desc' },
        take: 50,
        include: {
          _count: { select: { errors: true } },
        },
      },
    },
  });

  if (!feed) {
    notFound();
  }

  const status = statusConfig[feed.status];
  const StatusIcon = status.icon;

  // Calculate stats from runs
  const successfulRuns = feed.runs.filter(r => r.status === 'SUCCEEDED').length;
  const failedRuns = feed.runs.filter(r => r.status === 'FAILED').length;
  const totalProducts = feed.runs[0]?.productsUpserted || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/affiliate-feeds"
            className="p-2 rounded-md hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{feed.source.name}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {feed.source.retailer?.name || 'No retailer'} &middot; {feed.network}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${status.color}`}>
            <StatusIcon className="h-4 w-4" />
            {status.label}
          </span>
          <FeedStatusActions feed={feed} />
        </div>
      </div>

      {/* Consecutive failures alert */}
      {feed.consecutiveFailures >= 2 && feed.status !== 'DISABLED' && (
        <div className="rounded-md bg-orange-50 p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-orange-800">
                {feed.consecutiveFailures} consecutive failures
              </h3>
              <p className="mt-1 text-sm text-orange-700">
                This feed will be auto-disabled after 3 consecutive failures.
                Review recent errors below.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle className="h-6 w-6 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Successful Runs</dt>
                  <dd className="text-lg font-semibold text-gray-900">{successfulRuns}</dd>
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
                  <dt className="text-sm font-medium text-gray-500 truncate">Failed Runs</dt>
                  <dd className="text-lg font-semibold text-gray-900">{failedRuns}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Hash className="h-6 w-6 text-blue-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Products (Last Run)</dt>
                  <dd className="text-lg font-semibold text-gray-900">{totalProducts.toLocaleString()}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Clock className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Expiry Hours</dt>
                  <dd className="text-lg font-semibold text-gray-900">{feed.expiryHours}h</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Configuration Details */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Configuration</h2>
        </div>
        <div className="px-6 py-4">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="flex items-center gap-1 text-sm font-medium text-gray-500">
                <Server className="h-4 w-4" />
                Transport
              </dt>
              <dd className="mt-1 text-sm text-gray-900">
                {feed.transport} &middot; {feed.host}:{feed.port}
              </dd>
            </div>

            <div>
              <dt className="flex items-center gap-1 text-sm font-medium text-gray-500">
                <FileText className="h-4 w-4" />
                Path
              </dt>
              <dd className="mt-1 text-sm text-gray-900 font-mono">{feed.path}</dd>
            </div>

            <div>
              <dt className="flex items-center gap-1 text-sm font-medium text-gray-500">
                <Download className="h-4 w-4" />
                Format
              </dt>
              <dd className="mt-1 text-sm text-gray-900">
                {feed.format} {feed.compression !== 'NONE' && `(${feed.compression})`}
              </dd>
            </div>

            <div>
              <dt className="flex items-center gap-1 text-sm font-medium text-gray-500">
                <Clock className="h-4 w-4" />
                Schedule
              </dt>
              <dd className="mt-1 text-sm text-gray-900">
                {feed.scheduleFrequencyHours ? `Every ${feed.scheduleFrequencyHours} hours` : 'Manual only'}
              </dd>
            </div>

            <div>
              <dt className="flex items-center gap-1 text-sm font-medium text-gray-500">
                <Calendar className="h-4 w-4" />
                Next Run
              </dt>
              <dd className="mt-1 text-sm text-gray-900">
                {feed.nextRunAt
                  ? new Date(feed.nextRunAt).toLocaleString()
                  : feed.manualRunPending
                    ? 'Pending manual run'
                    : '—'}
              </dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">Username</dt>
              <dd className="mt-1 text-sm text-gray-900 font-mono">{feed.username}</dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">Password</dt>
              <dd className="mt-1 text-sm text-gray-500">••••••••</dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">Max File Size</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {feed.maxFileSizeBytes
                  ? `${(Number(feed.maxFileSizeBytes) / 1024 / 1024).toFixed(0)} MB`
                  : '500 MB (default)'}
              </dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">Max Rows</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {feed.maxRowCount?.toLocaleString() || '500,000 (default)'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Change Detection */}
      {(feed.lastRemoteMtime || feed.lastRemoteSize || feed.lastContentHash) && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Change Detection</h2>
          </div>
          <div className="px-6 py-4">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Last Remote Mtime</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {feed.lastRemoteMtime
                    ? new Date(feed.lastRemoteMtime).toLocaleString()
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Last Remote Size</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {feed.lastRemoteSize
                    ? `${(Number(feed.lastRemoteSize) / 1024 / 1024).toFixed(2)} MB`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Last Content Hash</dt>
                <dd className="mt-1 text-sm text-gray-900 font-mono text-xs">
                  {feed.lastContentHash?.slice(0, 16) || '—'}...
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {/* Run History */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Run History</h2>
        </div>
        <RunsTable runs={feed.runs} feedId={feed.id} />
      </div>

      {/* Metadata */}
      <div className="text-sm text-gray-500">
        <p>Created: {new Date(feed.createdAt).toLocaleString()} by {feed.createdBy || 'Unknown'}</p>
        <p>Feed Lock ID: {feed.feedLockId.toString()}</p>
      </div>
    </div>
  );
}
