import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@ironscout/db';
import {
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Package,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { InsightCard } from './insight-card';
import { hasProAccess } from '@/lib/subscription';

export default async function InsightsPage() {
  const session = await getSession();

  if (!session || session.type !== 'dealer') {
    redirect('/login');
  }

  // PRO feature gate - redirect STANDARD tier to upgrade
  if (!hasProAccess(session.tier)) {
    redirect('/settings/billing?upgrade=pro&feature=market-context');
  }

  const dealerId = session.dealerId;

  // Get active insights
  const insights = await prisma.dealerInsight.findMany({
    where: {
      dealerId,
      isActive: true,
      OR: [
        { dismissedUntil: null },
        { dismissedUntil: { lt: new Date() } },
      ],
    },
    orderBy: [
      { confidence: 'desc' },
      { createdAt: 'desc' },
    ],
    include: {
      dealerSku: true,
    },
  });

  // Group by type
  const overpriced = insights.filter(i => i.type === 'OVERPRICED');
  const underpriced = insights.filter(i => i.type === 'UNDERPRICED');
  const stockOpportunity = insights.filter(i => i.type === 'STOCK_OPPORTUNITY');
  const attributeGap = insights.filter(i => i.type === 'ATTRIBUTE_GAP');

  const typeConfig = {
    OVERPRICED: { 
      icon: TrendingUp, 
      color: 'text-red-600', 
      bg: 'bg-red-50', 
      border: 'border-red-200',
      label: 'Above Market' 
    },
    UNDERPRICED: { 
      icon: TrendingDown, 
      color: 'text-green-600', 
      bg: 'bg-green-50', 
      border: 'border-green-200',
      label: 'Below Market' 
    },
    STOCK_OPPORTUNITY: { 
      icon: Package, 
      color: 'text-blue-600', 
      bg: 'bg-blue-50', 
      border: 'border-blue-200',
      label: 'Stock Opportunity' 
    },
    ATTRIBUTE_GAP: { 
      icon: AlertTriangle, 
      color: 'text-yellow-600', 
      bg: 'bg-yellow-50', 
      border: 'border-yellow-200',
      label: 'Missing Data' 
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Market Context</h1>
        <p className="mt-1 text-sm text-gray-500">
          See how your pricing compares to the broader market
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div className="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0 rounded-md bg-purple-100 p-3">
              <Lightbulb className="h-5 w-5 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Insights</p>
              <p className="text-xl font-semibold text-gray-900">{insights.length}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0 rounded-md bg-red-100 p-3">
              <TrendingUp className="h-5 w-5 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Above Market</p>
              <p className="text-xl font-semibold text-gray-900">{overpriced.length}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0 rounded-md bg-green-100 p-3">
              <TrendingDown className="h-5 w-5 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Below Market</p>
              <p className="text-xl font-semibold text-gray-900">{underpriced.length}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0 rounded-md bg-blue-100 p-3">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Stock Opportunities</p>
              <p className="text-xl font-semibold text-gray-900">{stockOpportunity.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Trust Notice */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <CheckCircle className="h-5 w-5 text-blue-600" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Your data, your decisions</h3>
            <p className="mt-1 text-sm text-blue-700">
              This is market context only. IronScout never changes your prices or shares your exact pricing with competitors.
              All data is based on anonymous market aggregates.
            </p>
          </div>
        </div>
      </div>

      {/* Insights List */}
      {insights.length === 0 ? (
        <div className="rounded-lg bg-white shadow">
          <div className="px-4 py-12 text-center sm:p-12">
            <Lightbulb className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No insights yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Insights will appear here once we have enough data to analyze your pricing.
              Make sure your feed is running and your SKUs are mapped.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Overpriced Section */}
          {overpriced.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-red-600" />
                Above Market ({overpriced.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {overpriced.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} config={typeConfig.OVERPRICED} />
                ))}
              </div>
            </div>
          )}

          {/* Underpriced Section */}
          {underpriced.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-green-600" />
                Below Market ({underpriced.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {underpriced.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} config={typeConfig.UNDERPRICED} />
                ))}
              </div>
            </div>
          )}

          {/* Stock Opportunities */}
          {stockOpportunity.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-600" />
                Stock Opportunities ({stockOpportunity.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {stockOpportunity.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} config={typeConfig.STOCK_OPPORTUNITY} />
                ))}
              </div>
            </div>
          )}

          {/* Attribute Gaps */}
          {attributeGap.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                Missing Data ({attributeGap.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {attributeGap.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} config={typeConfig.ATTRIBUTE_GAP} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
