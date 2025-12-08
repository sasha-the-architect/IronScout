'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DealerInsight, DealerSku } from '@ironscout/db';
import { X, ExternalLink, type LucideIcon } from 'lucide-react';

interface InsightWithSku extends DealerInsight {
  dealerSku: DealerSku | null;
}

interface InsightCardProps {
  insight: InsightWithSku;
  config: {
    icon: LucideIcon;
    color: string;
    bg: string;
    border: string;
    label: string;
  };
}

export function InsightCard({ insight, config }: InsightCardProps) {
  const router = useRouter();
  const [isDismissing, setIsDismissing] = useState(false);

  const handleDismiss = async (days: number) => {
    setIsDismissing(true);
    try {
      const res = await fetch(`/api/insights/${insight.id}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      });

      if (res.ok) {
        router.refresh();
      }
    } catch {
      // Ignore errors
    } finally {
      setIsDismissing(false);
    }
  };

  const Icon = config.icon;

  return (
    <div className={`rounded-lg border ${config.border} ${config.bg} p-4`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${config.color}`} />
          <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
          {insight.confidence === 'HIGH' && (
            <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-600">
              High Confidence
            </span>
          )}
        </div>
        <button
          onClick={() => handleDismiss(7)}
          disabled={isDismissing}
          className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          title="Dismiss for 7 days"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Title & Message */}
      <h3 className="mt-2 text-sm font-semibold text-gray-900">{insight.title}</h3>
      <p className="mt-1 text-sm text-gray-600">{insight.message}</p>

      {/* Price Data */}
      {(insight.dealerPrice || insight.marketMedian) && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {insight.dealerPrice && (
            <div>
              <p className="text-gray-500">Your Price</p>
              <p className="font-semibold text-gray-900">${Number(insight.dealerPrice).toFixed(2)}</p>
            </div>
          )}
          {insight.marketMedian && (
            <div>
              <p className="text-gray-500">Market Median</p>
              <p className="font-semibold text-gray-900">${Number(insight.marketMedian).toFixed(2)}</p>
            </div>
          )}
          {insight.deltaPercent && (
            <div className="col-span-2">
              <p className="text-gray-500">Difference</p>
              <p className={`font-semibold ${Number(insight.deltaPercent) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {Number(insight.deltaPercent) > 0 ? '+' : ''}{Number(insight.deltaPercent).toFixed(1)}%
                {insight.priceDelta && (
                  <span className="text-gray-500 font-normal">
                    {' '}(${Math.abs(Number(insight.priceDelta)).toFixed(2)})
                  </span>
                )}
              </p>
            </div>
          )}
          {insight.sellerCount && (
            <div className="col-span-2 text-xs text-gray-500">
              Based on {insight.sellerCount} seller{insight.sellerCount > 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center justify-between">
        {insight.dealerSku?.rawUrl ? (
          <a
            href={insight.dealerSku.rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            View Product
            <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        ) : (
          <div />
        )}
        
        <div className="flex gap-2">
          <button
            onClick={() => handleDismiss(1)}
            disabled={isDismissing}
            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            Dismiss 1d
          </button>
          <button
            onClick={() => handleDismiss(30)}
            disabled={isDismissing}
            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            Dismiss 30d
          </button>
        </div>
      </div>
    </div>
  );
}
