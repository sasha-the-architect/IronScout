import { prisma } from '@ironscout/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ExternalLink,
  Tag,
  Barcode,
  Package,
  Scale,
  Target,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Fingerprint,
  Link as LinkIcon,
  Plus,
} from 'lucide-react';
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

  // If already resolved, redirect or show info
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
  const candidates = evidence?.candidates ?? [];
  const rulesFired = evidence?.rulesFired ?? [];

  // Get existing products for manual linking (search by brand/caliber)
  const searchProducts = await prisma.products.findMany({
    where: {
      OR: [
        inputNormalized?.brandNorm ? { brandNorm: inputNormalized.brandNorm } : {},
        inputNormalized?.caliberNorm ? { caliberNorm: inputNormalized.caliberNorm } : {},
      ].filter(c => Object.keys(c).length > 0),
    },
    take: 20,
    orderBy: { name: 'asc' },
  });

  // Get distinct brands and calibers for autocomplete (promotes consistency)
  const [distinctBrands, distinctCalibers] = await Promise.all([
    prisma.products.findMany({
      where: { brandNorm: { not: null } },
      select: { brandNorm: true },
      distinct: ['brandNorm'],
      orderBy: { brandNorm: 'asc' },
    }),
    prisma.products.findMany({
      where: { caliberNorm: { not: null } },
      select: { caliberNorm: true },
      distinct: ['caliberNorm'],
      orderBy: { caliberNorm: 'asc' },
    }),
  ]);

  const brands = distinctBrands.map(b => b.brandNorm!).filter(Boolean);
  const calibers = distinctCalibers.map(c => c.caliberNorm!).filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/review-queue"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Review Queue
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">
            Review Product Link
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
              link.reasonCode === 'INSUFFICIENT_DATA'
                ? 'bg-orange-100 text-orange-700'
                : link.reasonCode === 'AMBIGUOUS_FINGERPRINT'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            {link.reasonCode ?? 'Needs Review'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Source Product Info */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Source Product
            </h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500">Title</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {sourceProduct?.title ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Brand</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {sourceProduct?.brand ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Source</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {sourceProduct?.sources?.name ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">URL</dt>
                <dd className="mt-1 text-sm text-gray-900 truncate">
                  {sourceProduct?.url ? (
                    <a
                      href={sourceProduct.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      View Product
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>

            {/* Identifiers */}
            {sourceProduct?.source_product_identifiers &&
              sourceProduct.source_product_identifiers.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <dt className="text-sm font-medium text-gray-500 mb-2">
                    Identifiers
                  </dt>
                  <div className="flex flex-wrap gap-2">
                    {sourceProduct.source_product_identifiers.map((id, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-sm"
                      >
                        <Barcode className="h-3 w-3 text-gray-500" />
                        <span className="font-medium">{id.idType}:</span>
                        <span className="font-mono">{id.idValue}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
          </div>

          {/* Extracted Fields */}
          {inputNormalized && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Extracted Fields
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <Target className="h-4 w-4" />
                    Caliber
                  </div>
                  <div className="text-lg font-medium text-gray-900">
                    {inputNormalized.caliberNorm ?? '—'}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <Tag className="h-4 w-4" />
                    Brand
                  </div>
                  <div className="text-lg font-medium text-gray-900">
                    {inputNormalized.brandNorm ?? '—'}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <Scale className="h-4 w-4" />
                    Grain
                  </div>
                  <div className="text-lg font-medium text-gray-900">
                    {inputNormalized.grain ?? '—'}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <Package className="h-4 w-4" />
                    Pack Count
                  </div>
                  <div className="text-lg font-medium text-gray-900">
                    {inputNormalized.packCount ?? '—'}
                  </div>
                </div>
              </div>

              {/* Rules Fired */}
              {rulesFired.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <dt className="text-sm font-medium text-gray-500 mb-2">
                    Rules Fired
                  </dt>
                  <div className="flex flex-wrap gap-1">
                    {rulesFired.map((rule, idx) => (
                      <span
                        key={idx}
                        className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-mono"
                      >
                        {rule}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Candidates */}
          {candidates.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                <Fingerprint className="inline h-5 w-5 mr-2 text-purple-500" />
                Match Candidates ({candidates.length})
              </h2>
              <div className="space-y-3">
                {candidates.map((candidate, idx) => (
                  <div
                    key={candidate.productId}
                    className={`border rounded-lg p-4 ${
                      idx === 0 ? 'border-purple-300 bg-purple-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">
                          {candidate.canonicalKey || candidate.productId}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {candidate.brandNorm} · {candidate.caliberNorm} ·{' '}
                          {candidate.grain}gr · {candidate.packCount}rd
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-gray-900">
                          {(candidate.score * 100).toFixed(0)}%
                        </div>
                        <div className="text-xs text-gray-500">match score</div>
                      </div>
                    </div>

                    {candidate.matchDetails && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {candidate.matchDetails.brandMatch && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs">
                            <CheckCircle className="h-3 w-3" />
                            Brand
                          </span>
                        )}
                        {candidate.matchDetails.caliberMatch && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs">
                            <CheckCircle className="h-3 w-3" />
                            Caliber
                          </span>
                        )}
                        {candidate.matchDetails.packMatch && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs">
                            <CheckCircle className="h-3 w-3" />
                            Pack
                          </span>
                        )}
                        {candidate.matchDetails.grainMatch && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs">
                            <CheckCircle className="h-3 w-3" />
                            Grain
                          </span>
                        )}
                        {!candidate.matchDetails.brandMatch && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs">
                            <XCircle className="h-3 w-3" />
                            Brand
                          </span>
                        )}
                        {!candidate.matchDetails.caliberMatch && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs">
                            <XCircle className="h-3 w-3" />
                            Caliber
                          </span>
                        )}
                        {!candidate.matchDetails.packMatch && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs">
                            <XCircle className="h-3 w-3" />
                            Pack
                          </span>
                        )}
                        {!candidate.matchDetails.grainMatch && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs">
                            <XCircle className="h-3 w-3" />
                            Grain
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - Actions */}
        <div className="space-y-6">
          <ReviewActions
            sourceProductId={id}
            candidates={candidates}
            searchProducts={searchProducts.map(p => ({
              id: p.id,
              name: p.name,
              canonicalKey: p.canonicalKey,
              brandNorm: p.brandNorm,
              caliberNorm: p.caliberNorm,
            }))}
            inputNormalized={inputNormalized}
            knownBrands={brands}
            knownCalibers={calibers}
          />
        </div>
      </div>
    </div>
  );
}
