import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const suggestSchema = z.object({
  suggestedName: z.string().min(1, 'Product name is required'),
  suggestedUpc: z.string().optional(),
  caliber: z.string().min(1, 'Caliber is required'),
  grain: z.number().int().positive().optional(),
  packSize: z.number().int().positive().optional(),
  brand: z.string().optional(),
  bulletType: z.string().optional(),
  caseType: z.string().optional(),
});

/**
 * POST /api/skus/[id]/suggest
 * Submit a product suggestion for a merchant SKU that has no matching canonical product
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

    // Check for existing pending suggestion for this SKU
    const existingSuggestion = await prisma.product_suggestions.findFirst({
      where: {
        retailerSkuId: id,
        status: 'PENDING',
      },
    });

    if (existingSuggestion) {
      return NextResponse.json(
        { error: 'A suggestion for this product is already pending review' },
        { status: 409 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const validation = suggestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message || 'Invalid data' },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Create the suggestion
    const suggestion = await prisma.product_suggestions.create({
      data: {
        merchantId: session.merchantId,
        retailerSkuId: id,
        suggestedName: data.suggestedName,
        suggestedUpc: data.suggestedUpc || sku.rawUpc,
        caliber: data.caliber,
        grain: data.grain,
        packSize: data.packSize,
        brand: data.brand,
        bulletType: data.bulletType,
        caseType: data.caseType,
      },
    });

    return NextResponse.json({
      success: true,
      suggestionId: suggestion.id,
      message: 'Product suggestion submitted for admin review',
    });
  } catch (error) {
    console.error('Failed to submit product suggestion:', error);
    return NextResponse.json({ error: 'Failed to submit suggestion' }, { status: 500 });
  }
}

/**
 * GET /api/skus/[id]/suggest
 * Check if there's a pending suggestion for this SKU
 */
export async function GET(
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

    // Find suggestion for this SKU
    const suggestion = await prisma.product_suggestions.findFirst({
      where: { retailerSkuId: id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      suggestion: suggestion
        ? {
            id: suggestion.id,
            status: suggestion.status,
            suggestedName: suggestion.suggestedName,
            caliber: suggestion.caliber,
            grain: suggestion.grain,
            packSize: suggestion.packSize,
            brand: suggestion.brand,
            rejectionNote: suggestion.rejectionNote,
            createdAt: suggestion.createdAt,
            resolvedAt: suggestion.resolvedAt,
          }
        : null,
    });
  } catch (error) {
    console.error('Failed to get suggestion:', error);
    return NextResponse.json({ error: 'Failed to get suggestion' }, { status: 500 });
  }
}
