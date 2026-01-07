import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@ironscout/db';
import {
  BarChart3,
  MousePointerClick,
  DollarSign,
  TrendingUp,
  Calendar
} from 'lucide-react';
import { hasProAccess } from '@/lib/subscription';

export default async function AnalyticsPage() {
  const session = await getSession();

  if (!session || session.type !== 'merchant') {
    redirect('/login');
  }

  // PRO feature gate - redirect STANDARD tier to upgrade
  if (!hasProAccess(session.tier)) {
    redirect('/settings/billing?upgrade=pro&feature=custom-analytics');
  }

  const merchantId = session.merchantId;

  // Get date ranges
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get click and revenue stats
  const [
    clicksToday,
    clicksWeek,
    clicksMonth,
    revenueToday,
    revenueWeek,
    revenueMonth,
    merchant
  ] = await Promise.all([
    prisma.click_events.count({
      where: { merchantId, createdAt: { gte: today } },
    }),
    prisma.click_events.count({
      where: { merchantId, createdAt: { gte: weekAgo } },
    }),
    prisma.click_events.count({
      where: { merchantId, createdAt: { gte: monthAgo } },
    }),
    prisma.pixel_events.aggregate({
      where: { merchantId, createdAt: { gte: today } },
      _sum: { orderValue: true },
      _count: true,
    }),
    prisma.pixel_events.aggregate({
      where: { merchantId, createdAt: { gte: weekAgo } },
      _sum: { orderValue: true },
      _count: true,
    }),
    prisma.pixel_events.aggregate({
      where: { merchantId, createdAt: { gte: monthAgo } },
      _sum: { orderValue: true },
      _count: true,
    }),
    prisma.merchants.findUnique({
      where: { id: merchantId },
      select: { pixelEnabled: true, pixelApiKey: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track clicks, conversions, and revenue from IronScout
        </p>
      </div>

      {/* Click Stats */}
      <div className="rounded-lg bg-white shadow">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-base font-semibold leading-6 text-gray-900 flex items-center gap-2 mb-4">
            <MousePointerClick className="h-5 w-5 text-gray-400" />
            Click Performance
          </h3>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="rounded-lg bg-gray-50 px-4 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Today</p>
                  <p className="text-2xl font-semibold text-gray-900">{clicksToday.toLocaleString()}</p>
                </div>
                <Calendar className="h-8 w-8 text-gray-300" />
              </div>
            </div>

            <div className="rounded-lg bg-gray-50 px-4 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Last 7 Days</p>
                  <p className="text-2xl font-semibold text-gray-900">{clicksWeek.toLocaleString()}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-gray-300" />
              </div>
            </div>

            <div className="rounded-lg bg-gray-50 px-4 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Last 30 Days</p>
                  <p className="text-2xl font-semibold text-gray-900">{clicksMonth.toLocaleString()}</p>
                </div>
                <BarChart3 className="h-8 w-8 text-gray-300" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Stats */}
      <div className="rounded-lg bg-white shadow">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-base font-semibold leading-6 text-gray-900 flex items-center gap-2 mb-4">
            <DollarSign className="h-5 w-5 text-gray-400" />
            Revenue Attribution
          </h3>

          {!merchant?.pixelEnabled ? (
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
              <p className="text-sm text-yellow-800">
                <strong>Pixel not enabled.</strong> Set up your tracking pixel to see revenue attribution.
              </p>
              <a
                href="/settings/pixel"
                className="mt-2 inline-flex items-center text-sm font-medium text-yellow-700 hover:text-yellow-800"
              >
                Set up pixel →
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <div className="rounded-lg bg-green-50 px-4 py-5">
                <div>
                  <p className="text-sm font-medium text-green-700">Today</p>
                  <p className="text-2xl font-semibold text-green-900">
                    ${Number(revenueToday._sum.orderValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-green-600">{revenueToday._count} orders</p>
                </div>
              </div>

              <div className="rounded-lg bg-green-50 px-4 py-5">
                <div>
                  <p className="text-sm font-medium text-green-700">Last 7 Days</p>
                  <p className="text-2xl font-semibold text-green-900">
                    ${Number(revenueWeek._sum.orderValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-green-600">{revenueWeek._count} orders</p>
                </div>
              </div>

              <div className="rounded-lg bg-green-50 px-4 py-5">
                <div>
                  <p className="text-sm font-medium text-green-700">Last 30 Days</p>
                  <p className="text-2xl font-semibold text-green-900">
                    ${Number(revenueMonth._sum.orderValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-green-600">{revenueMonth._count} orders</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
