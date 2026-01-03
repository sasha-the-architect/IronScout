import { getSession } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@ironscout/db';
import Link from 'next/link';
import {
  ArrowLeft,
  Package,
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
  Tag,
  DollarSign,
  Calendar,
  Hash,
  Crosshair,
  Scale,
  Boxes,
  Building2,
  Link as LinkIcon,
  Clock,
} from 'lucide-react';
import { SkuMappingCard } from './sku-mapping-card';
import { MarketComparisonCard } from './market-comparison-card';

export const dynamic = 'force-dynamic';

const confidenceConfig = {
  HIGH: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', label: 'High Confidence' },
  MEDIUM: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Medium Confidence' },
  LOW: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-100', label: 'Low Confidence' },
  NONE: { icon: HelpCircle, color: 'text-gray-400', bg: 'bg-gray-100', label: 'Not Mapped' },
};

export default async function SkuDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();

  if (!session || session.type !== 'merchant') {
    redirect('/login');
  }

  const { id } = await params;

  // Look up retailerId via merchant_retailers
  const merchantRetailer = await prisma.merchant_retailers.findFirst({
    where: { merchantId: session.merchantId },
    select: { retailerId: true }
  });
  const retailerId = merchantRetailer?.retailerId;

  // Fetch SKU with related data
  const sku = retailerId ? await prisma.retailer_skus.findFirst({
    where: {
      id,
      retailerId,
    },
    include: {
      canonical_skus: {
        include: {
          benchmarks: true,
        },
      },
      merchant_insights: {
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  }) : null;

  if (!sku) {
    notFound();
  }

  const confidence = confidenceConfig[sku.mappingConfidence];
  const ConfidenceIcon = confidence.icon;

  // Calculate price per round if we have pack size
  const pricePerRound = sku.rawPrice && sku.rawPackSize
    ? Number(sku.rawPrice) / sku.rawPackSize
    : sku.rawPrice && sku.parsedPackSize
      ? Number(sku.rawPrice) / sku.parsedPackSize
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Link
            href="/skus"
            className="mt-1 p-2 rounded-md hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 max-w-2xl">
                {sku.rawTitle}
              </h1>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${confidence.bg} ${confidence.color}`}>
                <ConfidenceIcon className="h-4 w-4" />
                {confidence.label}
              </span>
              {sku.needsReview && (
                <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-yellow-100 text-yellow-700">
                  Needs Review
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
              {sku.rawUpc && <span>UPC: {sku.rawUpc}</span>}
              {sku.rawSku && <span>SKU: {sku.rawSku}</span>}
              {sku.rawUrl && (
                <a
                  href={sku.rawUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                >
                  View on your site
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Product Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Price & Stock */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-gray-400" />
                Pricing
              </h2>
            </div>
            <div className="px-6 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-500">List Price</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    ${Number(sku.rawPrice).toFixed(2)}
                  </p>
                </div>
                {pricePerRound && (
                  <div>
                    <p className="text-sm text-gray-500">Per Round</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      ${pricePerRound.toFixed(3)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500">Stock Status</p>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium ${
                    sku.rawInStock
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {sku.rawInStock ? 'In Stock' : 'Out of Stock'}
                  </span>
                </div>
                {(sku.rawPackSize || sku.parsedPackSize) && (
                  <div>
                    <p className="text-sm text-gray-500">Pack Size</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {sku.rawPackSize || sku.parsedPackSize} rounds
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Raw Feed Data */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                <Package className="h-5 w-5 text-gray-400" />
                Feed Data
              </h2>
            </div>
            <div className="px-6 py-4">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Title</dt>
                  <dd className="mt-1 text-sm text-gray-900">{sku.rawTitle}</dd>
                </div>
                {sku.rawUpc && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">UPC</dt>
                    <dd className="mt-1 text-sm text-gray-900 font-mono">{sku.rawUpc}</dd>
                  </div>
                )}
                {sku.rawSku && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Your SKU</dt>
                    <dd className="mt-1 text-sm text-gray-900 font-mono">{sku.rawSku}</dd>
                  </div>
                )}
                {sku.rawBrand && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Brand (from feed)</dt>
                    <dd className="mt-1 text-sm text-gray-900">{sku.rawBrand}</dd>
                  </div>
                )}
                {sku.rawCaliber && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Caliber (from feed)</dt>
                    <dd className="mt-1 text-sm text-gray-900">{sku.rawCaliber}</dd>
                  </div>
                )}
                {sku.rawUrl && (
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-medium text-gray-500">Product URL</dt>
                    <dd className="mt-1 text-sm text-blue-600 truncate">
                      <a href={sku.rawUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {sku.rawUrl}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Parsed Attributes */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                <Crosshair className="h-5 w-5 text-gray-400" />
                Parsed Attributes
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Automatically extracted from the product title
              </p>
            </div>
            <div className="px-6 py-4">
              {(sku.parsedCaliber || sku.parsedGrain || sku.parsedPackSize || sku.parsedBrand || sku.parsedBulletType) ? (
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {sku.parsedCaliber && (
                    <div className="flex items-start gap-3">
                      <Crosshair className="h-5 w-5 text-gray-400 mt-0.5" />
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Caliber</dt>
                        <dd className="text-sm text-gray-900">{sku.parsedCaliber}</dd>
                      </div>
                    </div>
                  )}
                  {sku.parsedGrain && (
                    <div className="flex items-start gap-3">
                      <Scale className="h-5 w-5 text-gray-400 mt-0.5" />
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Grain Weight</dt>
                        <dd className="text-sm text-gray-900">{sku.parsedGrain}gr</dd>
                      </div>
                    </div>
                  )}
                  {sku.parsedPackSize && (
                    <div className="flex items-start gap-3">
                      <Boxes className="h-5 w-5 text-gray-400 mt-0.5" />
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Pack Size</dt>
                        <dd className="text-sm text-gray-900">{sku.parsedPackSize} rounds</dd>
                      </div>
                    </div>
                  )}
                  {sku.parsedBrand && (
                    <div className="flex items-start gap-3">
                      <Building2 className="h-5 w-5 text-gray-400 mt-0.5" />
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Brand</dt>
                        <dd className="text-sm text-gray-900">{sku.parsedBrand}</dd>
                      </div>
                    </div>
                  )}
                  {sku.parsedBulletType && (
                    <div className="flex items-start gap-3">
                      <Tag className="h-5 w-5 text-gray-400 mt-0.5" />
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Bullet Type</dt>
                        <dd className="text-sm text-gray-900">{sku.parsedBulletType}</dd>
                      </div>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-gray-500 italic">
                  No attributes could be parsed from the product title. Consider adding more detail to your feed data.
                </p>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                <Clock className="h-5 w-5 text-gray-400" />
                History
              </h2>
            </div>
            <div className="px-6 py-4">
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-gray-500">First Seen</dt>
                  <dd className="text-gray-900">{new Date(sku.createdAt).toLocaleDateString()}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Last Updated</dt>
                  <dd className="text-gray-900">{new Date(sku.updatedAt).toLocaleDateString()}</dd>
                </div>
                {sku.lastSeenAt && (
                  <div>
                    <dt className="text-gray-500">Last Seen in Feed</dt>
                    <dd className="text-gray-900">{new Date(sku.lastSeenAt).toLocaleDateString()}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-gray-500">Status</dt>
                  <dd>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      sku.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {sku.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </dd>
                </div>
                {sku.missingCount > 0 && (
                  <div>
                    <dt className="text-gray-500">Missing Count</dt>
                    <dd className="text-orange-600">{sku.missingCount} feed runs</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>

        {/* Right Column - Mapping & Market */}
        <div className="space-y-6">
          {/* Mapping Card */}
          <SkuMappingCard
            skuId={sku.id}
            canonicalSku={sku.canonical_skus}
            mappingConfidence={sku.mappingConfidence}
            needsReview={sku.needsReview}
            parsedAttributes={{
              caliber: sku.parsedCaliber,
              grain: sku.parsedGrain,
              packSize: sku.parsedPackSize,
              brand: sku.parsedBrand,
            }}
          />

          {/* Market Comparison */}
          {sku.canonical_skus && (
            <MarketComparisonCard
              canonicalSku={sku.canonical_skus}
              merchantPrice={Number(sku.rawPrice)}
              merchantPackSize={sku.rawPackSize || sku.parsedPackSize || sku.canonical_skus.packSize}
            />
          )}

          {/* Related Insights */}
          {sku.merchant_insights.length > 0 && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Related Insights</h2>
              </div>
              <div className="divide-y divide-gray-200">
                {sku.merchant_insights.map((insight) => (
                  <div key={insight.id} className="px-6 py-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className={`h-5 w-5 mt-0.5 ${
                        insight.confidence === 'HIGH' ? 'text-red-500' :
                        insight.confidence === 'MEDIUM' ? 'text-yellow-500' : 'text-gray-400'
                      }`} />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{insight.title}</p>
                        <p className="text-sm text-gray-500">{insight.message}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
