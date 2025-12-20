'use client';

import { Check, Crown, Zap } from 'lucide-react';
import Link from 'next/link';

interface PlanSummaryProps {
  tier: string;
}

const TIER_FEATURES: Record<string, { label: string; features: string[] }> = {
  STANDARD: {
    label: 'Standard',
    features: [
      'Product listings in IronScout',
      'Product feed ingestion',
      'Caliber-level market benchmarks',
      'Basic pricing context',
      'Email support',
    ],
  },
  PRO: {
    label: 'Pro',
    features: [
      'Product listings in IronScout',
      'Product feed ingestion',
      'Caliber-level market benchmarks',
      'Basic pricing context',
      'More frequent refresh',
      'SKU-level comparisons when available',
      'Historical pricing context',
      'API access',
      'Phone and email support',
    ],
  },
  FOUNDING: {
    label: 'Founding Member',
    features: [
      'Product listings in IronScout',
      'Product feed ingestion',
      'Caliber-level market benchmarks',
      'Basic pricing context',
      'More frequent refresh',
      'SKU-level comparisons when available',
      'Historical pricing context',
      'API access',
      'Phone and email support',
      '1 year free (PRO features)',
    ],
  },
};

export function PlanSummary({ tier }: PlanSummaryProps) {
  const config = TIER_FEATURES[tier] || TIER_FEATURES.STANDARD;
  const isFounding = tier === 'FOUNDING';
  const isPro = tier === 'PRO' || tier === 'FOUNDING';

  return (
    <div className="rounded-lg bg-white shadow">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold leading-6 text-gray-900 flex items-center gap-2">
            {isFounding ? (
              <Crown className="h-5 w-5 text-purple-500" />
            ) : (
              <Zap className="h-5 w-5 text-gray-400" />
            )}
            What your plan includes
          </h3>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isFounding
                ? 'bg-purple-100 text-purple-700'
                : isPro
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {config.label}
          </span>
        </div>

        <ul className="mt-4 space-y-2">
          {config.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <Check className="h-4 w-4 flex-shrink-0 text-green-500 mt-0.5" />
              <span className="text-sm text-gray-600">{feature}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <Link
            href="/settings/billing"
            className="text-sm font-medium text-gray-900 hover:text-gray-700"
          >
            View billing details →
          </Link>
        </div>
      </div>
    </div>
  );
}
