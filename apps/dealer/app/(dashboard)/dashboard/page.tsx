import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@ironscout/db';
import {
  Package,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Rss,
  Clock
} from 'lucide-react';
import { PlanSummary } from '@/components/plan-summary';

export default async function DashboardPage() {
  const session = await getSession();
  
  if (!session) {
    redirect('/login');
  }
  
  // Admin redirect
  if (session.type === 'admin') {
    redirect('/admin/dealers');
  }
  
  // Get dealer stats
  const dealerId = session.dealerId;
  
  const [
    skuCount,
    activeSkuCount,
    needsReviewCount,
    insightCount,
    feed,
    recentRun
  ] = await Promise.all([
    prisma.dealerSku.count({ where: { dealerId } }),
    prisma.dealerSku.count({ where: { dealerId, isActive: true } }),
    prisma.dealerSku.count({ where: { dealerId, needsReview: true } }),
    prisma.dealerInsight.count({ where: { dealerId, isActive: true } }),
    prisma.dealerFeed.findFirst({ where: { dealerId } }),
    prisma.dealerFeedRun.findFirst({ 
      where: { dealerId },
      orderBy: { startedAt: 'desc' }
    }),
  ]);
  
  const stats = [
    {
      name: 'Total SKUs',
      value: skuCount.toLocaleString(),
      icon: Package,
      color: 'bg-blue-500',
    },
    {
      name: 'Active SKUs',
      value: activeSkuCount.toLocaleString(),
      icon: CheckCircle,
      color: 'bg-green-500',
    },
    {
      name: 'Needs Review',
      value: needsReviewCount.toLocaleString(),
      icon: AlertTriangle,
      color: 'bg-yellow-500',
      href: '/skus?filter=needs-review',
    },
    {
      name: 'Active Insights',
      value: insightCount.toLocaleString(),
      icon: TrendingUp,
      color: 'bg-purple-500',
      href: '/insights',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {session.businessName}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Here's an overview of your dealer portal activity.
        </p>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6"
          >
            <dt>
              <div className={`absolute rounded-md p-3 ${stat.color}`}>
                <stat.icon className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
              <p className="ml-16 truncate text-sm font-medium text-gray-500">
                {stat.name}
              </p>
            </dt>
            <dd className="ml-16 flex items-baseline">
              <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
            </dd>
          </div>
        ))}
      </div>
      
      {/* Feed Status */}
      <div className="rounded-lg bg-white shadow">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-base font-semibold leading-6 text-gray-900 flex items-center gap-2">
            <Rss className="h-5 w-5 text-gray-400" />
            Feed Status
          </h3>
          
          {!feed ? (
            <div className="mt-4">
              <p className="text-sm text-gray-500">
                No feed configured yet. Set up your product feed to get started.
              </p>
              <a
                href="/feed"
                className="mt-3 inline-flex items-center rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800"
              >
                Configure Feed
              </a>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Status</span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  feed.status === 'HEALTHY' ? 'bg-green-100 text-green-700' :
                  feed.status === 'WARNING' ? 'bg-yellow-100 text-yellow-700' :
                  feed.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {feed.status}
                </span>
              </div>
              
              {recentRun && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Last Run
                  </span>
                  <span className="text-sm text-gray-900">
                    {new Date(recentRun.startedAt).toLocaleString()}
                  </span>
                </div>
              )}
              
              {recentRun && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Products Indexed</span>
                  <span className="text-sm text-gray-900">
                    {recentRun.indexedCount.toLocaleString()} / {recentRun.rowCount.toLocaleString()}
                  </span>
                </div>
              )}
              
              <div className="pt-2">
                <a
                  href="/feed"
                  className="text-sm font-medium text-gray-900 hover:text-gray-700"
                >
                  View feed details →
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Quick Actions */}
      <div className="rounded-lg bg-white shadow">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-base font-semibold leading-6 text-gray-900">
            Quick Actions
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <a
              href="/skus?filter=needs-review"
              className="relative flex items-center space-x-3 rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400"
            >
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-yellow-500" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="absolute inset-0" aria-hidden="true" />
                <p className="text-sm font-medium text-gray-900">Review SKUs</p>
                <p className="truncate text-sm text-gray-500">{needsReviewCount} need attention</p>
              </div>
            </a>
            
            <a
              href="/insights"
              className="relative flex items-center space-x-3 rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400"
            >
              <div className="flex-shrink-0">
                <TrendingUp className="h-6 w-6 text-purple-500" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="absolute inset-0" aria-hidden="true" />
                <p className="text-sm font-medium text-gray-900">View Insights</p>
                <p className="truncate text-sm text-gray-500">{insightCount} active insights</p>
              </div>
            </a>
            
            <a
              href="/analytics"
              className="relative flex items-center space-x-3 rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400"
            >
              <div className="flex-shrink-0">
                <TrendingUp className="h-6 w-6 text-blue-500" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="absolute inset-0" aria-hidden="true" />
                <p className="text-sm font-medium text-gray-900">Analytics</p>
                <p className="truncate text-sm text-gray-500">View traffic & revenue</p>
              </div>
            </a>
          </div>
        </div>
      </div>

      {/* Plan Summary */}
      <PlanSummary tier={session.tier} />
    </div>
  );
}
