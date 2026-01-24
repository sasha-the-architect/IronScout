'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Loader2, X, AlertTriangle, CheckCircle } from 'lucide-react';
import { reprocessAllNeedsReview } from '../quarantine/actions';

interface ReprocessButtonProps {
  needsReviewCount: number;
}

export function ReprocessButton({ needsReviewCount }: ReprocessButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showModal, setShowModal] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleReprocess = () => {
    setResult(null);
    startTransition(async () => {
      const response = await reprocessAllNeedsReview();

      if (response.success) {
        setResult({
          success: true,
          message: response.message || `Processed ${response.processed} records`,
        });
        // Refresh page data after short delay
        setTimeout(() => {
          router.refresh();
          setShowModal(false);
          setResult(null);
        }, 2000);
      } else {
        setResult({
          success: false,
          message: response.error || 'Failed to process records',
        });
      }
    });
  };

  if (needsReviewCount === 0) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
      >
        <RefreshCw className="h-4 w-4" />
        Reprocess All
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={() => !isPending && setShowModal(false)}
            aria-hidden="true"
          />

          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="relative w-full max-w-lg transform rounded-lg bg-white shadow-xl transition-all"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => !isPending && setShowModal(false)}
                disabled={isPending}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <RefreshCw className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Reprocess Review Queue
                    </h3>
                    <p className="text-sm text-gray-500">
                      Re-run resolver on products that couldn&apos;t be matched
                    </p>
                  </div>
                </div>

                {/* Result display */}
                {result && (
                  <div
                    className={`mb-4 p-4 rounded-lg flex items-start gap-3 ${
                      result.success
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-red-50 border border-red-200'
                    }`}
                  >
                    {result.success ? (
                      <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    )}
                    <p
                      className={`text-sm ${
                        result.success ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {result.message}
                    </p>
                  </div>
                )}

                {!result && (
                  <>
                    {/* Info */}
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-700">
                          <p className="font-medium">This will re-resolve products with NEEDS_REVIEW status.</p>
                          <p className="mt-1">
                            Use this after updating matcher/resolver logic to see if products
                            can now be matched to canonical products.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600">
                        <span className="font-semibold text-gray-900">{needsReviewCount}</span>{' '}
                        product links will be queued for re-resolution.
                      </p>
                    </div>
                  </>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowModal(false)}
                    disabled={isPending}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-50"
                  >
                    {result ? 'Close' : 'Cancel'}
                  </button>
                  {!result && (
                    <button
                      onClick={handleReprocess}
                      disabled={isPending || needsReviewCount === 0}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          Reprocess {needsReviewCount} Items
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
