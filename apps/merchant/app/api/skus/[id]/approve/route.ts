import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@ironscout/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/skus/[id]/approve
 * Approve the current mapping for a merchant SKU (marks it as reviewed)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();

  if (!session || session.type !== 'merchant') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify ownership and that it has a mapping
    const sku = await prisma.retailer_skus.findFirst({
      where: { id, retailerId: session.merchantId },
    });

    if (!sku) {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 });
    }

    if (!sku.canonicalSkuId) {
      return NextResponse.json({ error: 'SKU has no mapping to approve' }, { status: 400 });
    }

    // Approve the mapping
    await prisma.retailer_skus.update({
      where: { id },
      data: {
        needsReview: false,
        // Upgrade confidence if it was auto-mapped with low/medium confidence
        mappingConfidence: sku.mappingConfidence === 'LOW' || sku.mappingConfidence === 'MEDIUM'
          ? 'HIGH'
          : sku.mappingConfidence,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to approve SKU mapping:', error);
    return NextResponse.json({ error: 'Failed to approve mapping' }, { status: 500 });
  }
}
