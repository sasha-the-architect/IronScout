import { prisma } from '@ironscout/db';
import Link from 'next/link';
import { AlertTriangle, Filter, ChevronRight, Eye } from 'lucide-react';
import { QuarantineFilters } from './quarantine-filters';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    feedType?: string;
    status?: string;
    page?: string;
  }>;
}

export default async function QuarantinePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const feedType = params.feedType as 'RETAILER' | 'AFFILIATE' | undefined;
  const status = params.status || 'QUARANTINED';
  const page = parseInt(params.page || '1', 10);
  const pageSize = 50;

  // Build where clause
  const where: any = {
    status: status as any,
  };
  if (feedType) {
    where.feedType = feedType;
  }

  // Count total
  const total = await prisma.quarantined_records.count({ where });

  // Fetch records
  const records = await prisma.quarantined_records.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      feedType: true,
      feedId: true,
      runId: true,
      sourceId: true,
      retailerId: true,
      matchKey: true,
      rawData: true,
      blockingErrors: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Count by feedType for display
  const [retailerCount, affiliateCount] = await Promise.all([
    prisma.quarantined_records.count({ where: { ...where, feedType: 'RETAILER' } }),
    prisma.quarantined_records.count({ where: { ...where, feedType: 'AFFILIATE' } }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Quarantined Records</h1>
            <p className="mt-1 text-sm text-gray-500">
              Records that failed validation and need review
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <QuarantineFilters
        currentFeedType={feedType}
        currentStatus={status}
        retailerCount={retailerCount}
        affiliateCount={affiliateCount}
      />

      {/* Summary */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {records.length} of {total} records
            {feedType && ` (${feedType} only)`}
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-gray-500">
              Retailer: <span className="font-medium text-gray-900">{retailerCount}</span>
            </span>
            <span className="text-gray-500">
              Affiliate: <span className="font-medium text-gray-900">{affiliateCount}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Feed Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Errors
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {records.map((record) => {
              const rawData = record.rawData as { name?: string; url?: string; price?: number };
              const errors = record.blockingErrors as Array<{ code: string; message: string }>;

              return (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      record.feedType === 'AFFILIATE'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {record.feedType}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                      {rawData.name || 'Unknown'}
                    </div>
                    <div className="text-sm text-gray-500 truncate max-w-xs">
                      {rawData.url || record.matchKey}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {errors.slice(0, 2).map((err, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded"
                          title={err.message}
                        >
                          {err.code}
                        </span>
                      ))}
                      {errors.length > 2 && (
                        <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                          +{errors.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(record.createdAt).toISOString().split('T')[0]}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      record.status === 'QUARANTINED'
                        ? 'bg-amber-100 text-amber-700'
                        : record.status === 'RESOLVED'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {record.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <Link
                      href={`/quarantine/${record.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
            {records.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No quarantined records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-lg shadow">
          <div className="text-sm text-gray-700">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/quarantine?feedType=${feedType || ''}&status=${status}&page=${page - 1}`}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/quarantine?feedType=${feedType || ''}&status=${status}&page=${page + 1}`}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
