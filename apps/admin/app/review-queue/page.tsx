import { prisma } from '@ironscout/db';
import Link from 'next/link';
import {
  AlertTriangle,
  Eye,
  HelpCircle,
  Fingerprint,
  FileQuestion,
  Clock,
  CheckCircle,
  SkipForward,
  XCircle,
} from 'lucide-react';
import { ReviewQueueFilters } from './review-queue-filters';
import { ReprocessButton } from './reprocess-button';

export const dynamic = 'force-dynamic';

/** Statuses that appear in the active review queue */
const ACTIVE_REVIEW_STATUSES = ['NEEDS_REVIEW', 'UNMATCHED'] as const;

const reasonCodeLabels: Record<string, { label: string; icon: typeof AlertTriangle; color: string }> = {
  INSUFFICIENT_DATA: {
    label: 'Insufficient Data',
    icon: FileQuestion,
    color: 'bg-orange-100 text-orange-700',
  },
  AMBIGUOUS_FINGERPRINT: {
    label: 'Ambiguous Match',
    icon: Fingerprint,
    color: 'bg-purple-100 text-purple-700',
  },
  UPC_NOT_TRUSTED: {
    label: 'UPC Not Trusted',
    icon: AlertTriangle,
    color: 'bg-yellow-100 text-yellow-700',
  },
  CONFLICTING_IDENTIFIERS: {
    label: 'Conflicting IDs',
    icon: AlertTriangle,
    color: 'bg-red-100 text-red-700',
  },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  NEEDS_REVIEW: { label: 'Needs Review', color: 'bg-blue-100 text-blue-700' },
  UNMATCHED: { label: 'Unmatched', color: 'bg-yellow-100 text-yellow-700' },
  SKIPPED: { label: 'Skipped', color: 'bg-gray-100 text-gray-700' },
};

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ reasonCode?: string; source?: string; status?: string; showSkipped?: string }>;
}) {
  const { reasonCode, source, status, showSkipped } = await searchParams;

  // Determine which statuses to query
  const statusFilter = status
    ? [status]
    : showSkipped === 'true'
    ? [...ACTIVE_REVIEW_STATUSES, 'SKIPPED']
    : [...ACTIVE_REVIEW_STATUSES];

  // Build where clause
  const where: Record<string, unknown> = {
    status: { in: statusFilter },
  };

  if (reasonCode) {
    where.reasonCode = reasonCode;
  }

  if (source) {
    where.source_products = {
      sourceId: source,
    };
  }

  // Get counts by status (for stats)
  const statusCounts = await prisma.product_links.groupBy({
    by: ['status'],
    where: { status: { in: ['NEEDS_REVIEW', 'UNMATCHED', 'SKIPPED'] } },
    _count: { id: true },
  });

  const needsReviewCount = statusCounts.find(s => s.status === 'NEEDS_REVIEW')?._count.id ?? 0;
  const unmatchedCount = statusCounts.find(s => s.status === 'UNMATCHED')?._count.id ?? 0;
  const skippedCount = statusCounts.find(s => s.status === 'SKIPPED')?._count.id ?? 0;
  const totalActive = needsReviewCount + unmatchedCount;

  // Get counts by reason code (for active items only)
  const reasonCodeCounts = await prisma.product_links.groupBy({
    by: ['reasonCode'],
    where: { status: { in: [...ACTIVE_REVIEW_STATUSES] } },
    _count: { id: true },
  });

  // Get items needing review
  const items = await prisma.product_links.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      source_products: {
        include: {
          sources: {
            select: { name: true, id: true },
          },
          source_product_identifiers: {
            select: { idType: true, idValue: true },
          },
        },
      },
    },
  });

  // Get unique sources for filter
  const sources = await prisma.sources.findMany({
    where: {
      source_products: {
        some: {
          product_links: {
            status: { in: [...ACTIVE_REVIEW_STATUSES] },
          },
        },
      },
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Review Queue</h1>
          <p className="mt-1 text-sm text-gray-500">
            Products awaiting manual review and linking
          </p>
        </div>
        <ReprocessButton needsReviewCount={needsReviewCount + unmatchedCount} />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Active */}
        <div className="bg-white shadow rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Clock className="h-6 w-6 text-blue-500" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Active Queue</p>
              <p className="text-2xl font-semibold text-gray-900">{totalActive}</p>
            </div>
          </div>
        </div>

        {/* Needs Review */}
        <div className="bg-white shadow rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <HelpCircle className="h-6 w-6 text-blue-500" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Needs Review</p>
              <p className="text-2xl font-semibold text-gray-900">{needsReviewCount}</p>
            </div>
          </div>
        </div>

        {/* Unmatched (legacy) */}
        <div className="bg-white shadow rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <XCircle className="h-6 w-6 text-yellow-500" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Unmatched</p>
              <p className="text-2xl font-semibold text-gray-900">{unmatchedCount}</p>
            </div>
          </div>
        </div>

        {/* Skipped */}
        <div className="bg-white shadow rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <SkipForward className="h-6 w-6 text-gray-500" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Skipped</p>
              <p className="text-2xl font-semibold text-gray-900">{skippedCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Reason Code Breakdown (for active items) */}
      {totalActive > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Object.entries(reasonCodeLabels).map(([code, { label, icon: Icon, color }]) => {
            const count = reasonCodeCounts.find(r => r.reasonCode === code)?._count.id ?? 0;
            if (count === 0) return null;
            return (
              <div key={code} className="bg-white shadow rounded-lg p-3">
                <div className="flex items-center">
                  <Icon className={`h-5 w-5 ${color.includes('orange') ? 'text-orange-500' : color.includes('purple') ? 'text-purple-500' : color.includes('yellow') ? 'text-yellow-500' : 'text-red-500'}`} />
                  <div className="ml-3">
                    <p className="text-xs font-medium text-gray-500">{label}</p>
                    <p className="text-lg font-semibold text-gray-900">{count}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <ReviewQueueFilters
        sources={sources}
        currentReasonCode={reasonCode}
        currentSource={source}
        currentStatus={status}
        showSkipped={showSkipped === 'true'}
      />

      {/* Items Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Source
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reason
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Identifiers
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center">
                  <CheckCircle className="mx-auto h-12 w-12 text-green-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">Queue is empty</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    No products match the current filters.
                  </p>
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const reasonInfo = reasonCodeLabels[item.reasonCode ?? ''] ?? {
                  label: item.reasonCode ?? 'Unknown',
                  icon: HelpCircle,
                  color: 'bg-gray-100 text-gray-700',
                };
                const statusInfo = statusLabels[item.status] ?? {
                  label: item.status,
                  color: 'bg-gray-100 text-gray-700',
                };
                const ReasonIcon = reasonInfo.icon;
                const identifiers = item.source_products?.source_product_identifiers ?? [];
                const isSkipped = item.status === 'SKIPPED';

                return (
                  <tr key={item.id} className={`hover:bg-gray-50 ${isSkipped ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 max-w-xs truncate">
                        {item.source_products?.title ?? 'Unknown'}
                      </div>
                      <div className="text-sm text-gray-500 truncate max-w-xs">
                        {item.source_products?.brand ?? '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {item.source_products?.sources?.name ?? '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}
                      >
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${reasonInfo.color}`}
                      >
                        <ReasonIcon className="h-3 w-3" />
                        {reasonInfo.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {identifiers.length === 0 ? (
                          <span className="text-sm text-gray-400">None</span>
                        ) : (
                          identifiers.slice(0, 3).map((id, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700"
                            >
                              {id.idType}: {id.idValue.slice(0, 12)}
                              {id.idValue.length > 12 && '...'}
                            </span>
                          ))
                        )}
                        {identifiers.length > 3 && (
                          <span className="text-xs text-gray-500">
                            +{identifiers.length - 3} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {isSkipped ? (
                        <span className="text-sm text-gray-400">Skipped</span>
                      ) : (
                        <Link
                          href={`/review-queue/${item.sourceProductId}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md"
                        >
                          <Eye className="h-4 w-4" />
                          Review
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination info */}
      {items.length > 0 && (
        <div className="text-sm text-gray-500 text-center">
          Showing {items.length} items
          {!showSkipped && skippedCount > 0 && (
            <span className="ml-1">
              ({skippedCount} skipped items hidden)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
