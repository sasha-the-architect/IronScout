import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@ironscout/db';
import { Package, AlertTriangle, CheckCircle, HelpCircle, Search } from 'lucide-react';
import { SkuFilters } from './sku-filters';
import { SkuTable } from './sku-table';

interface SearchParams {
  filter?: string;
  page?: string;
  search?: string;
}

export default async function SkusPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  
  if (!session || session.type !== 'merchant') {
    redirect('/login');
  }
  
  const merchantId = session.merchantId;
  const filter = searchParams.filter || 'all';
  const page = parseInt(searchParams.page || '1');
  const search = searchParams.search || '';
  const pageSize = 25;

  // Look up retailerId via merchant_retailers
  const merchantRetailer = await prisma.merchant_retailers.findFirst({
    where: { merchantId },
    select: { retailerId: true }
  });
  const retailerId = merchantRetailer?.retailerId;

  // Build where clause
  const where: Record<string, unknown> = { retailerId };
  
  if (filter === 'needs-review') {
    where.needsReview = true;
  } else if (filter === 'unmapped') {
    where.canonicalSkuId = null;
  } else if (filter === 'mapped') {
    where.canonicalSkuId = { not: null };
  } else if (filter === 'out-of-stock') {
    where.rawInStock = false;
  }

  if (search) {
    where.OR = [
      { rawTitle: { contains: search, mode: 'insensitive' } },
      { rawUpc: { contains: search, mode: 'insensitive' } },
      { rawSku: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Get SKUs with pagination
  const [skus, totalCount, stats] = await Promise.all([
    retailerId ? prisma.retailer_skus.findMany({
      where,
      orderBy: [
        { needsReview: 'desc' },
        { updatedAt: 'desc' },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        canonical_skus: true,
      },
    }) : Promise.resolve([]),
    retailerId ? prisma.retailer_skus.count({ where }) : Promise.resolve(0),
    retailerId ? prisma.retailer_skus.groupBy({
      by: ['needsReview', 'mappingConfidence'],
      where: { retailerId },
      _count: true,
    }) : Promise.resolve([]),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  // Serialize SKUs to plain objects (convert Decimal to number)
  const serializedSkus = skus.map(sku => ({
    ...sku,
    rawPrice: sku.rawPrice ? Number(sku.rawPrice) : null,
    canonical_skus: sku.canonical_skus ? {
      ...sku.canonical_skus,
      // Convert any Decimal fields in canonical_skus if needed
    } : null,
  }));

  // Calculate stats
  const needsReviewCount = stats
    .filter(s => s.needsReview)
    .reduce((acc, s) => acc + s._count, 0);
  
  const mappedCount = stats
    .filter(s => s.mappingConfidence !== 'NONE')
    .reduce((acc, s) => acc + s._count, 0);

  const totalSkus = stats.reduce((acc, s) => acc + s._count, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">SKU Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          View and manage your product catalog. Map products to get accurate benchmarks.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div className="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0 rounded-md bg-blue-100 p-3">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total SKUs</p>
              <p className="text-xl font-semibold text-gray-900">{totalSkus.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0 rounded-md bg-green-100 p-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Mapped</p>
              <p className="text-xl font-semibold text-gray-900">{mappedCount.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0 rounded-md bg-yellow-100 p-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Needs Review</p>
              <p className="text-xl font-semibold text-gray-900">{needsReviewCount.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0 rounded-md bg-gray-100 p-3">
              <HelpCircle className="h-5 w-5 text-gray-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Unmapped</p>
              <p className="text-xl font-semibold text-gray-900">{(totalSkus - mappedCount).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <SkuFilters currentFilter={filter} currentSearch={search} />

      {/* SKU Table */}
      <div className="rounded-lg bg-white shadow">
        <div className="px-4 py-5 sm:p-6">
          <SkuTable
            skus={serializedSkus}
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
          />
        </div>
      </div>
    </div>
  );
}
