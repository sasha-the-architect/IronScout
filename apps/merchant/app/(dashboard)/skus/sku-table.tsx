'use client';

import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { retailer_skus, canonical_skus } from '@ironscout/db';
import {
  Package,
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

// Serialized version of retailer_skus with Decimal converted to number
interface SerializedSku extends Omit<retailer_skus, 'rawPrice'> {
  rawPrice: number | null;
  canonical_skus: canonical_skus | null;
}

interface SkuTableProps {
  skus: SerializedSku[];
  page: number;
  totalPages: number;
  totalCount: number;
}

const confidenceConfig = {
  HIGH: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', label: 'High' },
  MEDIUM: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Medium' },
  LOW: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-100', label: 'Low' },
  NONE: { icon: HelpCircle, color: 'text-gray-400', bg: 'bg-gray-100', label: 'None' },
};

export function SkuTable({ skus, page, totalPages, totalCount }: SkuTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const goToPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(newPage));
    router.push(`${pathname}?${params.toString()}`);
  };

  if (skus.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No SKUs found</h3>
        <p className="mt-1 text-sm text-gray-500">
          {page > 1 ? 'Try going back to the first page.' : 'SKUs will appear here after your first feed run.'}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Price
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Parsed Attributes
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Mapping
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {skus.map((sku) => {
              const confidence = confidenceConfig[sku.mappingConfidence];
              
              return (
                <tr 
                  key={sku.id} 
                  className={sku.needsReview ? 'bg-yellow-50' : ''}
                >
                  <td className="px-4 py-4">
                    <div className="max-w-xs">
                      <div className="text-sm font-medium text-gray-900 truncate" title={sku.rawTitle}>
                        {sku.rawTitle}
                      </div>
                      <div className="text-xs text-gray-500 space-x-2">
                        {sku.rawUpc && <span>UPC: {sku.rawUpc}</span>}
                        {sku.rawSku && <span>SKU: {sku.rawSku}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      ${Number(sku.rawPrice).toFixed(2)}
                    </div>
                    {sku.rawPackSize && (
                      <div className="text-xs text-gray-500">
                        ${(Number(sku.rawPrice) / sku.rawPackSize).toFixed(3)}/rd
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-xs space-y-0.5">
                      {sku.parsedCaliber && (
                        <div><span className="text-gray-500">Caliber:</span> {sku.parsedCaliber}</div>
                      )}
                      {sku.parsedGrain && (
                        <div><span className="text-gray-500">Grain:</span> {sku.parsedGrain}gr</div>
                      )}
                      {sku.parsedPackSize && (
                        <div><span className="text-gray-500">Pack:</span> {sku.parsedPackSize}</div>
                      )}
                      {sku.parsedBrand && (
                        <div><span className="text-gray-500">Brand:</span> {sku.parsedBrand}</div>
                      )}
                      {!sku.parsedCaliber && !sku.parsedGrain && !sku.parsedPackSize && (
                        <span className="text-gray-400 italic">No attributes parsed</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {sku.canonical_skus ? (
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">{sku.canonical_skus.name}</div>
                        <div className="text-xs text-gray-500">
                          {sku.canonical_skus.caliber} · {sku.canonical_skus.grain}gr · {sku.canonical_skus.packSize}rd
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400 italic">Not mapped</span>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${confidence.bg} ${confidence.color}`}>
                        <confidence.icon className="h-3 w-3 mr-1" />
                        {confidence.label}
                      </span>
                      {sku.needsReview && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700">
                          Needs Review
                        </span>
                      )}
                      {!sku.rawInStock && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">
                          Out of Stock
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm">
                    <div className="flex items-center justify-end gap-2">
                      {sku.rawUrl && (
                        <a
                          href={sku.rawUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-gray-600"
                          title="View on your site"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <Link
                        href={`/skus/${sku.id}`}
                        className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                      >
                        {sku.needsReview ? 'Review' : 'View'}
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 sm:px-6 mt-4">
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{(page - 1) * 25 + 1}</span> to{' '}
                <span className="font-medium">{Math.min(page * 25, totalCount)}</span> of{' '}
                <span className="font-medium">{totalCount.toLocaleString()}</span> results
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </button>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
