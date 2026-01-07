'use server';

import { prisma, RetailerTier, RetailerVisibility } from '@ironscout/db';
import { revalidatePath } from 'next/cache';
import { getAdminSession, logAdminAction } from '@/lib/auth';

// ============================================================================
// Types
// ============================================================================

export interface RetailerFilters {
  search?: string;
  visibilityStatus?: RetailerVisibility;
  tier?: RetailerTier;
}

export interface RetailerStats {
  total: number;
  eligible: number;
  ineligible: number;
  suspended: number;
}

export interface RetailerListItem {
  id: string;
  name: string;
  website: string;
  logoUrl: string | null;
  tier: RetailerTier;
  visibilityStatus: RetailerVisibility;
  visibilityReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  merchantName: string | null;
  pricesCount: number;
  sourcesCount: number;
}

export interface RetailerDetail extends RetailerListItem {
  visibilityUpdatedAt: Date | null;
  visibilityUpdatedBy: string | null;
  feedsCount: number;
}

export interface CreateRetailerData {
  name: string;
  website: string;
  logoUrl?: string;
  tier?: RetailerTier;
  visibilityStatus?: RetailerVisibility;
  visibilityReason?: string;
}

export interface UpdateRetailerData {
  name?: string;
  website?: string;
  logoUrl?: string | null;
  tier?: RetailerTier;
}

// ============================================================================
// READ Operations
// ============================================================================

/**
 * Get retailer statistics
 */
export async function getRetailerStats(): Promise<{ success: boolean; data?: RetailerStats; error?: string }> {
  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const [total, eligible, ineligible, suspended] = await Promise.all([
      prisma.retailers.count(),
      prisma.retailers.count({ where: { visibilityStatus: 'ELIGIBLE' } }),
      prisma.retailers.count({ where: { visibilityStatus: 'INELIGIBLE' } }),
      prisma.retailers.count({ where: { visibilityStatus: 'SUSPENDED' } }),
    ]);

    return {
      success: true,
      data: { total, eligible, ineligible, suspended },
    };
  } catch (error) {
    console.error('Error getting retailer stats:', error);
    return { success: false, error: 'Failed to get retailer stats' };
  }
}

/**
 * Get list of retailers with optional filters
 */
export async function getRetailers(
  filters?: RetailerFilters
): Promise<{ success: boolean; data?: RetailerListItem[]; error?: string }> {
  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const where: any = {};

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { website: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters?.visibilityStatus) {
      where.visibilityStatus = filters.visibilityStatus;
    }

    if (filters?.tier) {
      where.tier = filters.tier;
    }

    const retailers = await prisma.retailers.findMany({
      where,
      include: {
        merchant_retailers: {
          include: {
            merchants: {
              select: { businessName: true },
            },
          },
          take: 1,
        },
        _count: {
          select: {
            prices: true,
            sources: true,
          },
        },
      },
      orderBy: [
        { visibilityStatus: 'asc' },
        { name: 'asc' },
      ],
    });

    const data: RetailerListItem[] = retailers.map((r) => ({
      id: r.id,
      name: r.name,
      website: r.website,
      logoUrl: r.logoUrl,
      tier: r.tier,
      visibilityStatus: r.visibilityStatus,
      visibilityReason: r.visibilityReason,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      merchantName: r.merchant_retailers[0]?.merchants?.businessName || null,
      pricesCount: r._count.prices,
      sourcesCount: r._count.sources,
    }));

    return { success: true, data };
  } catch (error) {
    console.error('Error getting retailers:', error);
    return { success: false, error: 'Failed to get retailers' };
  }
}

/**
 * Get single retailer by ID with full details
 */
export async function getRetailerById(
  id: string
): Promise<{ success: boolean; data?: RetailerDetail; error?: string }> {
  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const retailer = await prisma.retailers.findUnique({
      where: { id },
      include: {
        merchant_retailers: {
          include: {
            merchants: {
              select: { businessName: true },
            },
          },
          take: 1,
        },
        _count: {
          select: {
            prices: true,
            sources: true,
            retailer_feeds: true,
          },
        },
      },
    });

    if (!retailer) {
      return { success: false, error: 'Retailer not found' };
    }

    const data: RetailerDetail = {
      id: retailer.id,
      name: retailer.name,
      website: retailer.website,
      logoUrl: retailer.logoUrl,
      tier: retailer.tier,
      visibilityStatus: retailer.visibilityStatus,
      visibilityReason: retailer.visibilityReason,
      visibilityUpdatedAt: retailer.visibilityUpdatedAt,
      visibilityUpdatedBy: retailer.visibilityUpdatedBy,
      createdAt: retailer.createdAt,
      updatedAt: retailer.updatedAt,
      merchantName: retailer.merchant_retailers[0]?.merchants?.businessName || null,
      pricesCount: retailer._count.prices,
      sourcesCount: retailer._count.sources,
      feedsCount: retailer._count.retailer_feeds,
    };

    return { success: true, data };
  } catch (error) {
    console.error('Error getting retailer:', error);
    return { success: false, error: 'Failed to get retailer' };
  }
}

// ============================================================================
// CREATE Operations
// ============================================================================

/**
 * Create a new retailer
 */
export async function createRetailer(
  data: CreateRetailerData
): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Validate required fields
    if (!data.name?.trim()) {
      return { success: false, error: 'Name is required' };
    }

    if (!data.website?.trim()) {
      return { success: false, error: 'Website is required' };
    }

    // Normalize website URL
    let website = data.website.trim().toLowerCase();
    if (!website.startsWith('http://') && !website.startsWith('https://')) {
      website = 'https://' + website;
    }
    // Remove trailing slash
    website = website.replace(/\/+$/, '');

    // Check for duplicate website
    const existing = await prisma.retailers.findUnique({
      where: { website },
    });

    if (existing) {
      return { success: false, error: 'A retailer with this website already exists' };
    }

    const retailer = await prisma.retailers.create({
      data: {
        name: data.name.trim(),
        website,
        logoUrl: data.logoUrl?.trim() || null,
        tier: data.tier || 'STANDARD',
        visibilityStatus: data.visibilityStatus || 'ELIGIBLE',
        visibilityReason: data.visibilityReason?.trim() || null,
        visibilityUpdatedAt: new Date(),
        visibilityUpdatedBy: session.userId,
      },
    });

    await logAdminAction(session.userId, 'CREATE_RETAILER', {
      resource: 'Retailer',
      resourceId: retailer.id,
      newValue: {
        name: retailer.name,
        website: retailer.website,
        tier: retailer.tier,
        visibilityStatus: retailer.visibilityStatus,
      },
    });

    revalidatePath('/retailers');

    return { success: true, data: { id: retailer.id } };
  } catch (error) {
    console.error('Error creating retailer:', error);
    return { success: false, error: 'Failed to create retailer' };
  }
}

/**
 * Create a new retailer and optionally link to a merchant
 */
export async function createRetailerAndLink(
  data: CreateRetailerData & { merchantId?: string; listImmediately?: boolean }
): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Validate required fields
    if (!data.name?.trim()) {
      return { success: false, error: 'Name is required' };
    }

    if (!data.website?.trim()) {
      return { success: false, error: 'Website is required' };
    }

    // Normalize website URL
    let website = data.website.trim().toLowerCase();
    if (!website.startsWith('http://') && !website.startsWith('https://')) {
      website = 'https://' + website;
    }
    website = website.replace(/\/+$/, '');

    // Check for duplicate website
    const existing = await prisma.retailers.findUnique({
      where: { website },
    });

    if (existing) {
      return { success: false, error: 'A retailer with this website already exists' };
    }

    // If linking to merchant, verify it exists
    if (data.merchantId) {
      const merchant = await prisma.merchants.findUnique({
        where: { id: data.merchantId },
        select: { id: true },
      });
      if (!merchant) {
        return { success: false, error: 'Merchant not found' };
      }
    }

    // Create retailer and link in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const retailer = await tx.retailers.create({
        data: {
          name: data.name!.trim(),
          website,
          logoUrl: data.logoUrl?.trim() || null,
          tier: data.tier || 'STANDARD',
          visibilityStatus: data.visibilityStatus || 'ELIGIBLE',
          visibilityReason: data.visibilityReason?.trim() || null,
          visibilityUpdatedAt: new Date(),
          visibilityUpdatedBy: session.userId,
        },
      });

      // Link to merchant if specified
      if (data.merchantId) {
        await tx.merchant_retailers.create({
          data: {
            merchantId: data.merchantId,
            retailerId: retailer.id,
            listingStatus: data.listImmediately ? 'LISTED' : 'UNLISTED',
            status: data.listImmediately ? 'ACTIVE' : 'PENDING',
            listedAt: data.listImmediately ? new Date() : null,
            listedBy: data.listImmediately ? session.userId : null,
          },
        });
      }

      return retailer;
    });

    await logAdminAction(session.userId, 'CREATE_RETAILER', {
      resource: 'Retailer',
      resourceId: result.id,
      newValue: {
        name: result.name,
        website: result.website,
        tier: result.tier,
        visibilityStatus: result.visibilityStatus,
        linkedMerchantId: data.merchantId || null,
      },
    });

    revalidatePath('/retailers');
    if (data.merchantId) {
      revalidatePath(`/merchants/${data.merchantId}`);
    }

    return { success: true, data: { id: result.id } };
  } catch (error) {
    console.error('Error creating retailer:', error);
    return { success: false, error: 'Failed to create retailer' };
  }
}

// ============================================================================
// UPDATE Operations
// ============================================================================

/**
 * Update retailer basic info (name, website, logo, tier)
 */
export async function updateRetailer(
  id: string,
  data: UpdateRetailerData
): Promise<{ success: boolean; error?: string }> {
  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const oldRetailer = await prisma.retailers.findUnique({ where: { id } });
    if (!oldRetailer) {
      return { success: false, error: 'Retailer not found' };
    }

    // If website is changing, check for duplicates
    if (data.website && data.website !== oldRetailer.website) {
      let website = data.website.trim().toLowerCase();
      if (!website.startsWith('http://') && !website.startsWith('https://')) {
        website = 'https://' + website;
      }
      website = website.replace(/\/+$/, '');

      const existing = await prisma.retailers.findFirst({
        where: { website, id: { not: id } },
      });

      if (existing) {
        return { success: false, error: 'A retailer with this website already exists' };
      }

      data.website = website;
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.website !== undefined) updateData.website = data.website;
    if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl?.trim() || null;
    if (data.tier !== undefined) updateData.tier = data.tier;

    const updatedRetailer = await prisma.retailers.update({
      where: { id },
      data: updateData,
    });

    await logAdminAction(session.userId, 'UPDATE_RETAILER', {
      resource: 'Retailer',
      resourceId: id,
      oldValue: {
        name: oldRetailer.name,
        website: oldRetailer.website,
        logoUrl: oldRetailer.logoUrl,
        tier: oldRetailer.tier,
      },
      newValue: {
        name: updatedRetailer.name,
        website: updatedRetailer.website,
        logoUrl: updatedRetailer.logoUrl,
        tier: updatedRetailer.tier,
      },
    });

    revalidatePath('/retailers');
    revalidatePath(`/retailers/${id}`);

    return { success: true };
  } catch (error) {
    console.error('Error updating retailer:', error);
    return { success: false, error: 'Failed to update retailer' };
  }
}

/**
 * Update retailer visibility status
 */
export async function updateRetailerVisibility(
  id: string,
  status: RetailerVisibility,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const oldRetailer = await prisma.retailers.findUnique({ where: { id } });
    if (!oldRetailer) {
      return { success: false, error: 'Retailer not found' };
    }

    // Require reason for non-ELIGIBLE status
    if (status !== 'ELIGIBLE' && !reason?.trim()) {
      return { success: false, error: 'Reason is required when setting status to ' + status };
    }

    const updatedRetailer = await prisma.retailers.update({
      where: { id },
      data: {
        visibilityStatus: status,
        visibilityReason: status === 'ELIGIBLE' ? null : reason?.trim(),
        visibilityUpdatedAt: new Date(),
        visibilityUpdatedBy: session.userId,
      },
    });

    await logAdminAction(session.userId, 'UPDATE_RETAILER_VISIBILITY', {
      resource: 'Retailer',
      resourceId: id,
      oldValue: {
        visibilityStatus: oldRetailer.visibilityStatus,
        visibilityReason: oldRetailer.visibilityReason,
      },
      newValue: {
        visibilityStatus: updatedRetailer.visibilityStatus,
        visibilityReason: updatedRetailer.visibilityReason,
      },
    });

    revalidatePath('/retailers');
    revalidatePath(`/retailers/${id}`);

    return { success: true };
  } catch (error) {
    console.error('Error updating retailer visibility:', error);
    return { success: false, error: 'Failed to update retailer visibility' };
  }
}

// ============================================================================
// MERCHANT LINKING Operations
// ============================================================================

/**
 * Get merchants that can be linked to a retailer
 * Returns merchants that don't have a retailer linked yet
 */
export async function getAvailableMerchants(): Promise<{
  success: boolean;
  data?: Array<{ id: string; businessName: string; status: string }>;
  error?: string;
}> {
  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Get merchants that don't have any retailer linked
    const merchants = await prisma.merchants.findMany({
      where: {
        merchant_retailers: {
          none: {},
        },
      },
      select: {
        id: true,
        businessName: true,
        status: true,
      },
      orderBy: { businessName: 'asc' },
    });

    return { success: true, data: merchants };
  } catch (error) {
    console.error('Error getting available merchants:', error);
    return { success: false, error: 'Failed to get available merchants' };
  }
}

/**
 * Link a merchant to a retailer
 * Creates a merchant_retailers record
 */
export async function linkMerchantToRetailer(
  retailerId: string,
  merchantId: string,
  listImmediately: boolean = false
): Promise<{ success: boolean; error?: string }> {
  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Verify retailer exists
    const retailer = await prisma.retailers.findUnique({
      where: { id: retailerId },
      select: { id: true, name: true },
    });

    if (!retailer) {
      return { success: false, error: 'Retailer not found' };
    }

    // Verify merchant exists
    const merchant = await prisma.merchants.findUnique({
      where: { id: merchantId },
      select: { id: true, businessName: true },
    });

    if (!merchant) {
      return { success: false, error: 'Merchant not found' };
    }

    // Check if this specific merchant-retailer pair already exists
    const existingLink = await prisma.merchant_retailers.findFirst({
      where: { merchantId, retailerId },
    });

    if (existingLink) {
      return { success: false, error: 'This merchant is already linked to this retailer' };
    }

    // Note: Both 1:many relationships are now allowed:
    // - A merchant CAN have multiple retailers
    // - A retailer CAN have multiple merchants

    // Create the link
    await prisma.merchant_retailers.create({
      data: {
        merchantId,
        retailerId,
        listingStatus: listImmediately ? 'LISTED' : 'UNLISTED',
        status: listImmediately ? 'ACTIVE' : 'PENDING',
      },
    });

    await logAdminAction(session.userId, 'LINK_MERCHANT_TO_RETAILER', {
      resource: 'MerchantRetailer',
      resourceId: retailerId,
      newValue: {
        retailerId,
        retailerName: retailer.name,
        merchantId,
        merchantName: merchant.businessName,
        listImmediately,
      },
    });

    revalidatePath('/retailers');
    revalidatePath(`/retailers/${retailerId}`);
    revalidatePath('/merchants');
    revalidatePath(`/merchants/${merchantId}`);

    return { success: true };
  } catch (error) {
    console.error('Error linking merchant to retailer:', error);
    return { success: false, error: 'Failed to link merchant to retailer' };
  }
}

/**
 * Unlink a merchant from a retailer
 * Deletes the merchant_retailers record
 * @param retailerId - The retailer to unlink
 * @param merchantId - The merchant to unlink (required for 1:many support)
 */
export async function unlinkMerchantFromRetailer(
  retailerId: string,
  merchantId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Find the specific link
    const link = await prisma.merchant_retailers.findFirst({
      where: { retailerId, merchantId },
      include: {
        merchants: { select: { id: true, businessName: true } },
        retailers: { select: { id: true, name: true } },
      },
    });

    if (!link) {
      return { success: false, error: 'No link found between this merchant and retailer' };
    }

    // Delete the link
    await prisma.merchant_retailers.delete({
      where: { id: link.id },
    });

    await logAdminAction(session.userId, 'UNLINK_MERCHANT_FROM_RETAILER', {
      resource: 'MerchantRetailer',
      resourceId: retailerId,
      oldValue: {
        retailerId,
        retailerName: link.retailers.name,
        merchantId: link.merchants.id,
        merchantName: link.merchants.businessName,
      },
    });

    revalidatePath('/retailers');
    revalidatePath(`/retailers/${retailerId}`);
    revalidatePath('/merchants');
    revalidatePath(`/merchants/${merchantId}`);

    return { success: true };
  } catch (error) {
    console.error('Error unlinking merchant from retailer:', error);
    return { success: false, error: 'Failed to unlink merchant from retailer' };
  }
}

// ============================================================================
// DELETE Operations
// ============================================================================

/**
 * Delete a retailer (hard delete - use with caution)
 * Only allowed if retailer has no prices, sources, or feeds
 */
export async function deleteRetailer(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const retailer = await prisma.retailers.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            prices: true,
            sources: true,
            retailer_feeds: true,
          },
        },
      },
    });

    if (!retailer) {
      return { success: false, error: 'Retailer not found' };
    }

    // Check for related data
    if (retailer._count.prices > 0) {
      return { success: false, error: `Cannot delete: retailer has ${retailer._count.prices} prices` };
    }
    if (retailer._count.sources > 0) {
      return { success: false, error: `Cannot delete: retailer has ${retailer._count.sources} sources` };
    }
    if (retailer._count.retailer_feeds > 0) {
      return { success: false, error: `Cannot delete: retailer has ${retailer._count.retailer_feeds} feeds` };
    }

    // Delete merchant_retailer links first
    await prisma.merchant_retailers.deleteMany({
      where: { retailerId: id },
    });

    // Delete the retailer
    await prisma.retailers.delete({ where: { id } });

    await logAdminAction(session.userId, 'DELETE_RETAILER', {
      resource: 'Retailer',
      resourceId: id,
      oldValue: {
        name: retailer.name,
        website: retailer.website,
      },
    });

    revalidatePath('/retailers');

    return { success: true };
  } catch (error) {
    console.error('Error deleting retailer:', error);
    return { success: false, error: 'Failed to delete retailer' };
  }
}
