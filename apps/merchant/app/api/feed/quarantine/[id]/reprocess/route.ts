import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { logger } from '@/lib/logger';
import { createHash } from 'crypto';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

/**
 * POST /api/feed/quarantine/[id]/reprocess
 * Attempt to reprocess a quarantined record with corrections applied
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const reqLogger = logger.child({ endpoint: `/api/feed/quarantine/${id}/reprocess`, method: 'POST' });

  try {
    const session = await getSession();

    if (!session || session.type !== 'merchant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Look up retailerId via merchant_retailers
    const merchantRetailer = await prisma.merchant_retailers.findFirst({
      where: { merchantId: session.merchantId },
      select: { retailerId: true }
    });
    const retailerId = merchantRetailer?.retailerId;

    if (!retailerId) {
      return NextResponse.json({ error: 'No retailer configured for this merchant' }, { status: 400 });
    }

    // Get the quarantine record with corrections
    const record = await prisma.quarantined_records.findFirst({
      where: {
        id,
        retailerId,
      },
      include: {
        feed_corrections: {
          orderBy: { createdAt: 'desc' },
        },
        retailer_feeds: true,
      },
    });

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    if (record.status !== 'QUARANTINED') {
      return NextResponse.json(
        { error: 'Only quarantined records can be reprocessed' },
        { status: 400 }
      );
    }

    // Get parsed fields
    const parsedFields = record.parsedFields as Record<string, unknown> | null;
    if (!parsedFields) {
      return NextResponse.json(
        { error: 'Record has no parsed fields' },
        { status: 400 }
      );
    }

    // Apply corrections to get final values
    const correctedFields: Record<string, unknown> = { ...parsedFields };
    for (const correction of record.feed_corrections) {
      correctedFields[correction.field] = correction.newValue;
    }

    // Check if we now have a valid UPC
    const upc = correctedFields.upc as string | undefined;
    if (!upc || !isValidUPC(upc)) {
      return NextResponse.json(
        {
          error: 'Cannot reprocess: still missing valid UPC',
          currentUpc: upc || null,
        },
        { status: 400 }
      );
    }

    // Check required fields
    const title = correctedFields.title as string | undefined;
    const price = correctedFields.price as number | undefined;

    if (!title || !price || price <= 0) {
      return NextResponse.json(
        {
          error: 'Cannot reprocess: missing required fields (title or price)',
          hasTitle: !!title,
          hasValidPrice: price && price > 0,
        },
        { status: 400 }
      );
    }

    // Generate SKU hash
    const skuHash = generateSkuHash(
      title,
      upc,
      correctedFields.sku as string | undefined,
      price
    );

    // Create RetailerSku from corrected data
    const retailerSku = await prisma.retailer_skus.upsert({
      where: {
        retailerId_retailerSkuHash: {
          retailerId,
          retailerSkuHash: skuHash,
        },
      },
      create: {
        retailerId,
        feedId: record.feedId,
        retailerSkuHash: skuHash,
        rawTitle: title,
        rawPrice: price,
        rawUpc: upc,
        rawSku: correctedFields.sku as string | undefined,
        rawBrand: correctedFields.brand as string | undefined,
        rawCaliber: correctedFields.caliber as string | undefined,
        rawInStock: (correctedFields.inStock as boolean) ?? true,
        isActive: true,
      },
      update: {
        rawPrice: price,
        rawInStock: (correctedFields.inStock as boolean) ?? true,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    // Mark quarantine record as resolved
    await prisma.quarantined_records.update({
      where: { id },
      data: { status: 'RESOLVED' },
    });

    reqLogger.info('Quarantine record reprocessed', {
      quarantineId: id,
      retailerSkuId: retailerSku.id,
    });

    return NextResponse.json({
      success: true,
      retailerSku,
      message: 'Record successfully promoted to indexed SKUs',
    });
  } catch (error) {
    reqLogger.error('Failed to reprocess quarantine record', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

/**
 * Validate UPC format
 */
function isValidUPC(upc: string): boolean {
  const cleaned = upc.replace(/[^0-9]/g, '');
  return cleaned.length >= 8 && cleaned.length <= 14;
}

/**
 * Generate SKU hash for deduplication
 */
function generateSkuHash(
  title: string,
  upc?: string,
  sku?: string,
  price?: number
): string {
  const components = [
    title.toLowerCase().trim(),
    upc || '',
    sku || '',
    price ? String(price) : '',
  ];

  const hash = createHash('sha256')
    .update(components.join('|'))
    .digest('hex');

  return hash.substring(0, 32);
}
