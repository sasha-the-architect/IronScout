import { prisma } from '@ironscout/db';
import { notFound } from 'next/navigation';
import { formatDateTime } from '@/lib/utils';
import Link from 'next/link';
import {
  ArrowLeft,
  Globe,
  Calendar,
  Store,
  Eye,
  EyeOff,
  XCircle,
  ExternalLink,
  Database,
  Rss,
  DollarSign,
  Plus,
} from 'lucide-react';
import { EditRetailerForm } from './edit-form';
import { VisibilityActions } from './visibility-actions';
import { MerchantLinkSection } from './merchant-link-section';

export const dynamic = 'force-dynamic';

const visibilityConfig = {
  ELIGIBLE: { label: 'Eligible', color: 'bg-green-100 text-green-700', icon: Eye },
  INELIGIBLE: { label: 'Ineligible', color: 'bg-yellow-100 text-yellow-700', icon: EyeOff },
  SUSPENDED: { label: 'Suspended', color: 'bg-red-100 text-red-700', icon: XCircle },
};

const tierConfig = {
  STANDARD: { label: 'Standard', color: 'bg-gray-100 text-gray-700' },
  PREMIUM: { label: 'Premium', color: 'bg-purple-100 text-purple-700' },
};

export default async function RetailerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const retailer = await prisma.retailers.findUnique({
    where: { id },
    include: {
      merchant_retailers: {
        include: {
          merchants: {
            select: { id: true, businessName: true, status: true },
          },
        },
      },
      _count: {
        select: {
          prices: true,
          sources: true,
          retailer_feeds: true,
          retailer_skus: true,
        },
      },
    },
  });

  // Count affiliate feeds and source products via sources for this retailer
  const [affiliateFeedCount, sourceProductCount] = await Promise.all([
    prisma.affiliate_feeds.count({
      where: { sources: { retailerId: id } },
    }),
    prisma.source_products.count({
      where: { sources: { retailerId: id } },
    }),
  ]);

  if (!retailer) {
    notFound();
  }

  // Get recent feeds from both legacy (retailer_feeds) and new (affiliate_feeds) systems
  const [legacyFeeds, affiliateFeeds] = await Promise.all([
    prisma.retailer_feeds.findMany({
      where: { retailerId: id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        status: true,
        enabled: true,
        lastSuccessAt: true,
        createdAt: true,
      },
    }),
    prisma.affiliate_feeds.findMany({
      where: { sources: { retailerId: id } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        status: true,
        createdAt: true,
        sources: {
          select: { name: true },
        },
        affiliate_feed_runs: {
          where: { status: 'SUCCEEDED' },
          orderBy: { finishedAt: 'desc' },
          take: 1,
          select: { finishedAt: true },
        },
      },
    }),
  ]);

  // Normalize affiliate feeds to match legacy feed shape
  const normalizedAffiliateFeeds = affiliateFeeds.map(af => ({
    id: af.id,
    name: af.sources.name,
    status: af.status === 'ENABLED' ? 'HEALTHY' : af.status === 'DISABLED' ? 'FAILED' : 'PENDING',
    enabled: af.status === 'ENABLED',
    lastSuccessAt: af.affiliate_feed_runs[0]?.finishedAt || null,
    createdAt: af.createdAt,
    feedType: 'affiliate' as const,
  }));

  const normalizedLegacyFeeds = legacyFeeds.map(lf => ({
    ...lf,
    feedType: 'legacy' as const,
  }));

  // Combine and sort by createdAt desc, take top 5
  const feeds = [...normalizedLegacyFeeds, ...normalizedAffiliateFeeds]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const visibilityInfo = visibilityConfig[retailer.visibilityStatus];
  const tierInfo = tierConfig[retailer.tier];
  const VisibilityIcon = visibilityInfo.icon;
  const merchant = retailer.merchant_retailers[0]?.merchants;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/retailers"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Retailers
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          {retailer.logoUrl ? (
            <img
              src={retailer.logoUrl}
              alt={retailer.name}
              className="h-16 w-16 rounded-lg object-contain bg-gray-100"
            />
          ) : (
            <div className="h-16 w-16 rounded-lg bg-gray-200 flex items-center justify-center">
              <Store className="h-8 w-8 text-gray-500" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{retailer.name}</h1>
            <a
              href={retailer.website}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 text-sm text-blue-600 hover:underline flex items-center gap-1"
            >
              {retailer.website}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <EditRetailerForm retailer={{
            id: retailer.id,
            name: retailer.name,
            website: retailer.website,
            logoUrl: retailer.logoUrl,
            tier: retailer.tier,
          }} />
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${tierInfo.color}`}>
            {tierInfo.label}
          </span>
          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${visibilityInfo.color}`}>
            <VisibilityIcon className="h-4 w-4" />
            {visibilityInfo.label}
          </span>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Retailer Info */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Retailer Information</h2>
          <dl className="space-y-4">
            <div className="flex items-start gap-3">
              <Globe className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <dt className="text-sm font-medium text-gray-500">Website</dt>
                <dd className="text-sm text-gray-900">
                  <a
                    href={retailer.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline flex items-center gap-1"
                  >
                    {retailer.website}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Store className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <dt className="text-sm font-medium text-gray-500">Tier</dt>
                <dd className="text-sm text-gray-900">{retailer.tier}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <dt className="text-sm font-medium text-gray-500">Created</dt>
                <dd className="text-sm text-gray-900">{formatDateTime(retailer.createdAt)}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                <dd className="text-sm text-gray-900">{formatDateTime(retailer.updatedAt)}</dd>
              </div>
            </div>
          </dl>
        </div>

        {/* Visibility Info */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">Visibility Status</h2>
            <VisibilityActions
              retailerId={retailer.id}
              currentStatus={retailer.visibilityStatus}
            />
          </div>
          <dl className="space-y-4">
            <div className="flex items-start gap-3">
              <VisibilityIcon className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <dt className="text-sm font-medium text-gray-500">Status</dt>
                <dd>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${visibilityInfo.color}`}>
                    <VisibilityIcon className="h-3 w-3" />
                    {visibilityInfo.label}
                  </span>
                </dd>
              </div>
            </div>
            {retailer.visibilityReason && (
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <dt className="text-sm font-medium text-gray-500">Reason</dt>
                  <dd className="text-sm text-gray-900">{retailer.visibilityReason}</dd>
                </div>
              </div>
            )}
            {retailer.visibilityUpdatedAt && (
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <dt className="text-sm font-medium text-gray-500">Status Updated</dt>
                  <dd className="text-sm text-gray-900">
                    {formatDateTime(retailer.visibilityUpdatedAt)}
                    {retailer.visibilityUpdatedBy && (
                      <span className="text-gray-500"> by {retailer.visibilityUpdatedBy}</span>
                    )}
                  </dd>
                </div>
              </div>
            )}
          </dl>
        </div>

        {/* Linked Merchant */}
        <MerchantLinkSection
          retailerId={retailer.id}
          linkedMerchant={merchant || null}
        />

        {/* Stats */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Statistics</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{retailer._count.prices.toLocaleString()}</p>
                <p className="text-sm text-gray-500">Prices</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Database className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{retailer._count.sources}</p>
                <p className="text-sm text-gray-500">Sources</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Rss className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{affiliateFeedCount + retailer._count.retailer_feeds}</p>
                <p className="text-sm text-gray-500">Feeds</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Store className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{(sourceProductCount + retailer._count.retailer_skus).toLocaleString()}</p>
                <p className="text-sm text-gray-500">SKUs</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feeds Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">Feeds</h2>
          <div className="flex items-center gap-2">
            <Link
              href={`/retailer-feeds/create?retailerId=${retailer.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
              Retailer Feed
            </Link>
            <Link
              href={`/affiliate-feeds/create?retailerId=${retailer.id}&retailerName=${encodeURIComponent(retailer.name)}&retailerWebsite=${encodeURIComponent(retailer.website)}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Affiliate Feed
            </Link>
          </div>
        </div>
        {feeds.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Enabled</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Last Success</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {feeds.map((feed) => (
                  <tr key={feed.id}>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {feed.feedType === 'affiliate' ? (
                        <Link href={`/affiliate-feeds/${feed.id}`} className="text-blue-600 hover:underline">
                          {feed.name}
                        </Link>
                      ) : (
                        feed.name
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        feed.feedType === 'affiliate' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {feed.feedType === 'affiliate' ? 'Affiliate' : 'Legacy'}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        feed.status === 'HEALTHY' ? 'bg-green-100 text-green-700' :
                        feed.status === 'WARNING' ? 'bg-yellow-100 text-yellow-700' :
                        feed.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {feed.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {feed.enabled ? 'Yes' : 'No'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {feed.lastSuccessAt ? formatDateTime(feed.lastSuccessAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No feeds configured yet. Click "Create Feed" to add one.</p>
        )}
      </div>

      {/* Metadata */}
      <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-500">
        <p>Retailer ID: <code className="bg-gray-200 px-1 rounded">{retailer.id}</code></p>
      </div>
    </div>
  );
}
