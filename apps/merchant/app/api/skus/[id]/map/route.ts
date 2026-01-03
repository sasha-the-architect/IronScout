import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const mapSchema = z.object({
  canonicalSkuId: z.string().min(1),
});

/**
 * POST /api/skus/[id]/map
 * Map a merchant SKU to a canonical SKU
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
    // Verify ownership
    const sku = await prisma.retailer_skus.findFirst({
      where: { id, retailerId: session.merchantId },
    });

    if (!sku) {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const validation = mapSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid canonical SKU ID' }, { status: 400 });
    }

    const { canonicalSkuId } = validation.data;

    // Verify canonical SKU exists
    const canonicalSku = await prisma.canonical_skus.findUnique({
      where: { id: canonicalSkuId },
    });

    if (!canonicalSku) {
      return NextResponse.json({ error: 'Canonical SKU not found' }, { status: 404 });
    }

    // Update the mapping
    await prisma.retailer_skus.update({
      where: { id },
      data: {
        canonicalSkuId,
        mappingConfidence: 'HIGH', // Manual mapping = high confidence
        needsReview: false,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to map SKU:', error);
    return NextResponse.json({ error: 'Failed to update mapping' }, { status: 500 });
  }
}

/**
 * DELETE /api/skus/[id]/map
 * Remove the mapping from a merchant SKU
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();

  if (!session || session.type !== 'merchant') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify ownership
    const sku = await prisma.retailer_skus.findFirst({
      where: { id, retailerId: session.merchantId },
    });

    if (!sku) {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 });
    }

    // Clear the mapping
    await prisma.retailer_skus.update({
      where: { id },
      data: {
        canonicalSkuId: null,
        mappingConfidence: 'NONE',
        needsReview: false,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to clear SKU mapping:', error);
    return NextResponse.json({ error: 'Failed to clear mapping' }, { status: 500 });
  }
}
