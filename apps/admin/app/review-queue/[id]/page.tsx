import { prisma } from '@ironscout/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { SourceProductPanel } from './source-product-panel';
import { CandidateList } from './candidate-list';
import { ReviewActions } from './review-actions';

export const dynamic = 'force-dynamic';

interface Evidence {
  dictionaryVersion?: string;
  trustConfigVersion?: string | number;
  inputNormalized?: {
    title?: string;
    titleNorm?: string;
    brand?: string;
    brandNorm?: string;
    caliber?: string;
    caliberNorm?: string;
    upc?: string;
    upcNorm?: string;
    packCount?: number;
    grain?: number;
    url?: string;
    caseMaterial?: string;
    muzzleVelocityFps?: number;
    bulletType?: string;
  };
  inputHash?: string;
  rulesFired?: string[];
  candidates?: Array<{
    productId: string;
    canonicalKey: string;
    brandNorm?: string;
    caliberNorm?: string;
    packCount?: number;
    grain?: number;
    caseMaterial?: string;
    muzzleVelocityFps?: number;
    bulletType?: string;
    score: number;
    matchDetails?: {
      brandMatch: boolean;
      caliberMatch: boolean;
      packMatch: boolean;
      grainMatch: boolean;
      titleSimilarity: number;
    };
  }>;
  normalizationErrors?: string[];
}

interface CandidateStats {
  productId: string;
  sourceCount: number;
  retailerCount: number;
  lastSeenAt: Date | null;
}

interface PriceRange {
  productId: string;
  min: number;
  max: number;
  avg: number;
  count: number;
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Get the product link with source product details
  const link = await prisma.product_links.findUnique({
    where: { sourceProductId: id },
    include: {
      source_products: {
        include: {
          sources: {
            select: { id: true, name: true, url: true },
          },
          source_product_identifiers: true,
        },
      },
      products: true,
    },
  });

  if (!link) {
    notFound();
  }

  // If already resolved, show info
  if (link.status !== 'NEEDS_REVIEW' && link.status !== 'UNMATCHED') {
    return (
      <div className="space-y-6">
        <Link
          href="/review-queue"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Review Queue
        </Link>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
          <h2 className="mt-4 text-lg font-medium text-green-900">
            Already Resolved
          </h2>
          <p className="mt-2 text-sm text-green-700">
            This item has already been resolved with status: {link.status}
          </p>
          {link.productId && (
            <p className="mt-2 text-sm text-green-600">
              Linked to product: {link.products?.name ?? link.productId}
            </p>
          )}
        </div>
      </div>
    );
  }

  const sourceProduct = link.source_products;
  const evidence = link.evidence as Evidence | null;
  const inputNormalized = evidence?.inputNormalized;
  const allCandidates = evidence?.candidates ?? [];
  const normalizationErrors = evidence?.normalizationErrors ?? [];

  // Cap candidates at 10 for performance (price stats queries scale with N)
  const MAX_CANDIDATES = 10;
  const candidates = allCandidates.slice(0, MAX_CANDIDATES);
  const candidatesCapped = allCandidates.length > MAX_CANDIDATES;

  // Get candidate product IDs
  const candidateIds = candidates.map((c) => c.productId);

  // Fetch candidate product names, stats, and price ranges in parallel
  const [candidateProducts, candidateStats, priceRanges30d, priceRangesAllTime, searchProducts, distinctBrands, distinctCalibers] =
    await Promise.all([
      // Product names and UPCs for candidates
      candidateIds.length > 0
        ? prisma.products.findMany({
            where: { id: { in: candidateIds } },
            select: { id: true, name: true, upcNorm: true },
          })
        : Promise.resolve([]),

      // Candidate stats: source count, retailer count, last seen
      candidateIds.length > 0
        ? prisma.$queryRaw<CandidateStats[]>`
            SELECT
              pl."productId",
              COUNT(DISTINCT pl."sourceProductId")::int as "sourceCount",
              COUNT(DISTINCT sp."sourceId")::int as "retailerCount",
              MAX(spp."lastSeenAt") as "lastSeenAt"
            FROM product_links pl
            JOIN source_products sp ON sp.id = pl."sourceProductId"
            LEFT JOIN source_product_presence spp ON spp."sourceProductId" = sp.id
            WHERE pl."productId" = ANY(${candidateIds}::text[])
              AND pl.status IN ('MATCHED', 'CREATED')
            GROUP BY pl."productId"
          `.catch(() => [] as CandidateStats[])
        : Promise.resolve([] as CandidateStats[]),

      // 30-day price range (ADR-005: visibility filter, ADR-015: ignored run filter)
      candidateIds.length > 0
        ? prisma.$queryRaw<PriceRange[]>`
            SELECT
              pl."productId",
              MIN(pr.price)::float as "min",
              MAX(pr.price)::float as "max",
              AVG(pr.price)::float as "avg",
              COUNT(*)::int as "count"
            FROM prices pr
            JOIN product_links pl ON pl."sourceProductId" = pr."sourceProductId"
            JOIN retailers r ON r.id = pr."retailerId"
            LEFT JOIN affiliate_feed_runs afr ON afr.id = pr."affiliateFeedRunId"
            WHERE pl."productId" = ANY(${candidateIds}::text[])
              AND pl.status IN ('MATCHED', 'CREATED')
              AND pr."observedAt" >= NOW() - INTERVAL '30 days'
              AND r."visibilityStatus" = 'ELIGIBLE'
              AND (afr.id IS NULL OR afr."ignoredAt" IS NULL)
            GROUP BY pl."productId"
          `.catch(() => [] as PriceRange[])
        : Promise.resolve([] as PriceRange[]),

      // All-time price range (ADR-005: visibility filter, ADR-015: ignored run filter)
      candidateIds.length > 0
        ? prisma.$queryRaw<PriceRange[]>`
            SELECT
              pl."productId",
              MIN(pr.price)::float as "min",
              MAX(pr.price)::float as "max",
              AVG(pr.price)::float as "avg",
              COUNT(*)::int as "count"
            FROM prices pr
            JOIN product_links pl ON pl."sourceProductId" = pr."sourceProductId"
            JOIN retailers r ON r.id = pr."retailerId"
            LEFT JOIN affiliate_feed_runs afr ON afr.id = pr."affiliateFeedRunId"
            WHERE pl."productId" = ANY(${candidateIds}::text[])
              AND pl.status IN ('MATCHED', 'CREATED')
              AND r."visibilityStatus" = 'ELIGIBLE'
              AND (afr.id IS NULL OR afr."ignoredAt" IS NULL)
            GROUP BY pl."productId"
          `.catch(() => [] as PriceRange[])
        : Promise.resolve([] as PriceRange[]),

      // Search products for manual linking
      prisma.products.findMany({
        where: {
          OR: [
            inputNormalized?.brandNorm ? { brandNorm: inputNormalized.brandNorm } : {},
            inputNormalized?.caliberNorm ? { caliberNorm: inputNormalized.caliberNorm } : {},
          ].filter((c) => Object.keys(c).length > 0),
        },
        select: {
          id: true,
          name: true,
          canonicalKey: true,
          brandNorm: true,
          caliberNorm: true,
          upcNorm: true,
        },
        take: 20,
        orderBy: { name: 'asc' },
      }),

      // Distinct brands for autocomplete
      prisma.products.findMany({
        where: { brandNorm: { not: null } },
        select: { brandNorm: true },
        distinct: ['brandNorm'],
        orderBy: { brandNorm: 'asc' },
      }),

      // Distinct calibers for autocomplete
      prisma.products.findMany({
        where: { caliberNorm: { not: null } },
        select: { caliberNorm: true },
        distinct: ['caliberNorm'],
        orderBy: { caliberNorm: 'asc' },
      }),
    ]);

  // Convert stats and prices to lookup maps
  const productNameMap = new Map(candidateProducts.map((p) => [p.id, p.name]));
  const productUpcMap = new Map(candidateProducts.map((p) => [p.id, p.upcNorm]));
  const statsMap = new Map(candidateStats.map((s) => [s.productId, s]));
  const price30dMap = new Map(priceRanges30d.map((p) => [p.productId, p]));
  const priceAllTimeMap = new Map(priceRangesAllTime.map((p) => [p.productId, p]));

  const brands = distinctBrands.map((b) => b.brandNorm!).filter(Boolean);
  const calibers = distinctCalibers.map((c) => c.caliberNorm!).filter(Boolean);
  const candidatesForActions = candidates.map((candidate) => ({
    ...candidate,
    name: productNameMap.get(candidate.productId) ?? null,
    upcNorm: productUpcMap.get(candidate.productId) ?? null,
  }));

  // Get reason code display
  const reasonCodeDisplay = link.reasonCode ?? 'Needs Review';
  const reasonCodeStyle =
    link.reasonCode === 'INSUFFICIENT_DATA'
      ? 'bg-orange-100 text-orange-700 border-orange-200'
      : link.reasonCode === 'AMBIGUOUS_FINGERPRINT'
      ? 'bg-purple-100 text-purple-700 border-purple-200'
      : 'bg-yellow-100 text-yellow-700 border-yellow-200';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            href="/review-queue"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Review Queue
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-gray-900 truncate max-w-lg">
            {sourceProduct?.title ?? 'Review Product Link'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border ${reasonCodeStyle}`}
          >
            <AlertTriangle className="h-4 w-4" />
            {reasonCodeDisplay}
          </span>
        </div>
      </div>

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column - Source Product */}
        <div className="lg:col-span-4 space-y-4">
          {sourceProduct && (
            <SourceProductPanel
              sourceProduct={{
                id: sourceProduct.id,
                title: sourceProduct.title,
                url: sourceProduct.url,
                brand: sourceProduct.brand,
                caliber: sourceProduct.caliber,
                grainWeight: sourceProduct.grainWeight,
                roundCount: sourceProduct.roundCount,
                identityKey: sourceProduct.identityKey,
                sources: sourceProduct.sources,
                source_product_identifiers: sourceProduct.source_product_identifiers,
              }}
              inputNormalized={inputNormalized}
              evidence={evidence as Record<string, unknown> | null}
            />
          )}

          {/* Actions Panel - Sticky on desktop */}
          <div className="lg:sticky lg:top-4">
            <ReviewActions
              sourceProductId={id}
              candidates={candidatesForActions}
              searchProducts={searchProducts.map((p) => ({
                id: p.id,
                name: p.name,
                canonicalKey: p.canonicalKey,
                brandNorm: p.brandNorm,
                caliberNorm: p.caliberNorm,
                upcNorm: p.upcNorm,
              }))}
              inputNormalized={inputNormalized}
              knownBrands={brands}
              knownCalibers={calibers}
            />
          </div>
        </div>

        {/* Right Column - Candidates */}
        <div className="lg:col-span-8 space-y-4">
          {/* Evidence warnings */}
          {!evidence && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
              <strong>Warning:</strong> No resolver evidence found. This item may need manual investigation.
            </div>
          )}
          {normalizationErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <strong>Normalization Errors:</strong>
              <ul className="mt-1 list-disc list-inside">
                {normalizationErrors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {normalizationErrors.length > 5 && (
                  <li className="text-red-500">... and {normalizationErrors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
          {candidatesCapped && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
              <strong>Note:</strong> Showing top {MAX_CANDIDATES} of {allCandidates.length} candidates for performance.
            </div>
          )}

          <CandidateList
            sourceProductId={id}
            candidates={candidates.map((candidate) => {
              const stats = statsMap.get(candidate.productId);
              const price30d = price30dMap.get(candidate.productId);
              const priceAllTime = priceAllTimeMap.get(candidate.productId);
              const productName = productNameMap.get(candidate.productId);

              return {
                candidate: {
                  ...candidate,
                  name: productName ?? null,
                  upcNorm: productUpcMap.get(candidate.productId) ?? null,
                },
                stats: stats
                  ? {
                      sourceCount: stats.sourceCount,
                      retailerCount: stats.retailerCount,
                      lastSeenAt: stats.lastSeenAt,
                    }
                  : null,
                priceRange30d: price30d
                  ? {
                      min: price30d.min,
                      max: price30d.max,
                      avg: price30d.avg,
                      count: price30d.count,
                    }
                  : null,
                priceRangeAllTime: priceAllTime
                  ? {
                      min: priceAllTime.min,
                      max: priceAllTime.max,
                      avg: priceAllTime.avg,
                      count: priceAllTime.count,
                    }
                  : null,
              };
            })}
            inputNormalized={inputNormalized}
          />
        </div>
      </div>
    </div>
  );
}
