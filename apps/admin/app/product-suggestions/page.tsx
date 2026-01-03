import { prisma } from '@ironscout/db';
import { Package, Clock, CheckCircle, XCircle, GitMerge } from 'lucide-react';
import { SuggestionActions } from './suggestion-actions';

export const dynamic = 'force-dynamic';

const statusConfig = {
  PENDING: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
  MERGED: { label: 'Merged', color: 'bg-blue-100 text-blue-700', icon: GitMerge },
};

export default async function ProductSuggestionsPage() {
  const suggestions = await prisma.product_suggestions.findMany({
    orderBy: [
      { status: 'asc' }, // PENDING first
      { createdAt: 'desc' },
    ],
    include: {
      merchants: {
        select: { businessName: true },
      },
      retailer_skus: {
        select: { id: true, rawTitle: true, rawUpc: true, rawPrice: true },
      },
      canonical_skus: {
        select: { id: true, name: true },
      },
    },
  });

  const pendingCount = suggestions.filter(s => s.status === 'PENDING').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Suggestions</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and approve new product suggestions from merchants
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Package className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total</dt>
                  <dd className="text-lg font-semibold text-gray-900">{suggestions.length}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Clock className="h-6 w-6 text-yellow-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Pending</dt>
                  <dd className="text-lg font-semibold text-gray-900">{pendingCount}</dd>
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
                  <dt className="text-sm font-medium text-gray-500 truncate">Approved</dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    {suggestions.filter(s => s.status === 'APPROVED').length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <GitMerge className="h-6 w-6 text-blue-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Merged</dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    {suggestions.filter(s => s.status === 'MERGED').length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Alert */}
      {pendingCount > 0 && (
        <div className="rounded-md bg-yellow-50 p-4">
          <div className="flex">
            <Clock className="h-5 w-5 text-yellow-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                {pendingCount} suggestion{pendingCount !== 1 ? 's' : ''} awaiting review
              </h3>
              <p className="mt-1 text-sm text-yellow-700">
                Review and approve/reject new product suggestions below.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Suggestions Table */}
      <div className="bg-white shadow rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Suggested Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Attributes
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Dealer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Submitted
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {suggestions.map((suggestion) => {
              const status = statusConfig[suggestion.status];
              const StatusIcon = status.icon;

              return (
                <tr key={suggestion.id} className={suggestion.status === 'PENDING' ? 'bg-yellow-50' : ''}>
                  <td className="px-6 py-4">
                    <div className="max-w-xs">
                      <div className="text-sm font-medium text-gray-900">
                        {suggestion.suggestedName}
                      </div>
                      {suggestion.suggestedUpc && (
                        <div className="text-xs text-gray-500 font-mono">
                          UPC: {suggestion.suggestedUpc}
                        </div>
                      )}
                      {suggestion.retailer_skus && (
                        <div className="text-xs text-gray-400 mt-1 truncate" title={suggestion.retailer_skus.rawTitle}>
                          From: {suggestion.retailer_skus.rawTitle}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {suggestion.caliber}
                      {suggestion.grain && ` · ${suggestion.grain}gr`}
                      {suggestion.packSize && ` · ${suggestion.packSize}rd`}
                    </div>
                    {suggestion.brand && (
                      <div className="text-xs text-gray-500">{suggestion.brand}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{suggestion.merchants.businessName}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </span>
                    {suggestion.status === 'APPROVED' && suggestion.canonical_skus && (
                      <div className="text-xs text-gray-500 mt-1">
                        → {suggestion.canonical_skus.name}
                      </div>
                    )}
                    {suggestion.status === 'REJECTED' && suggestion.rejectionNote && (
                      <div className="text-xs text-red-500 mt-1" title={suggestion.rejectionNote}>
                        {suggestion.rejectionNote.slice(0, 30)}...
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(suggestion.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    {suggestion.status === 'PENDING' && (
                      <SuggestionActions suggestion={{
                        id: suggestion.id,
                        suggestedName: suggestion.suggestedName,
                        caliber: suggestion.caliber,
                        grain: suggestion.grain,
                        packSize: suggestion.packSize,
                        brand: suggestion.brand,
                      }} />
                    )}
                  </td>
                </tr>
              );
            })}

            {suggestions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No product suggestions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
