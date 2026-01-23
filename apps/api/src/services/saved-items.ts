/**
 * Saved Items Service (ADR-011 Phase 2)
 *
 * Core business logic for the unified Saved Items concept.
 * Single save action creates both tracking (WatchlistItem) and notifications (Alert).
 *
 * Design principle:
 * Alert records are declarative rule markers; all user preferences and runtime state
 * are stored on WatchlistItem.
 *
 * This service uses the watchlist-item repository for core operations.
 * See: apps/api/src/services/watchlist-item/
 */

import { randomUUID } from 'crypto'
import { prisma, AlertRuleType, Prisma } from '@ironscout/db'
import { visiblePriceWhere } from '../config/tiers'
import { watchlistItemRepository } from './watchlist-item'

// ============================================================================
// Types
// ============================================================================

export interface SavedItemDTO {
  id: string
  productId: string
  name: string
  brand: string
  caliber: string
  price: number | null
  inStock: boolean
  imageUrl: string | null
  savedAt: string

  // Notification preferences
  notificationsEnabled: boolean
  priceDropEnabled: boolean
  backInStockEnabled: boolean
  minDropPercent: number
  minDropAmount: number
  stockAlertCooldownHours: number
}

export interface SavedItemsResponse {
  items: SavedItemDTO[]
  _meta: {
    tier: string
    itemCount: number
    itemLimit: number
    canAddMore: boolean
  }
}

export interface UpdatePrefsInput {
  notificationsEnabled?: boolean
  priceDropEnabled?: boolean
  backInStockEnabled?: boolean
  minDropPercent?: number
  minDropAmount?: number
  stockAlertCooldownHours?: number
}

// Validation constraints
const PREFS_VALIDATION = {
  minDropPercent: { min: 0, max: 100 },
  minDropAmount: { min: 0 },
  stockAlertCooldownHours: { min: 1, max: 168 }, // 1 hour to 1 week
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Save an item (idempotent with resurrection support)
 *
 * Per ADR-011A Section 12.1:
 * - If active item exists: no-op (idempotent)
 * - If soft-deleted item exists: resurrect it (clear deletedAt, preserve preferences)
 * - Otherwise: create new item with defaults
 *
 * Creates Alert rows for PRICE_DROP and BACK_IN_STOCK if missing.
 * All in one DB transaction.
 */
export async function saveItem(
  userId: string,
  productId: string
): Promise<SavedItemDTO> {
  // Handle save/resurrect in transaction
  // All checks inside transaction to prevent race conditions
  const result = await prisma.$transaction(async (tx) => {
    // Verify product exists (inside transaction for consistency)
    const product = await tx.products.findUnique({
      where: { id: productId },
      select: { id: true }
    })

    if (!product) {
      throw new Error('Product not found')
    }

    // Check for existing item (includes soft-deleted for resurrection)
    const existing = await tx.watchlist_items.findFirst({
      where: { userId, productId, intentType: 'SKU' },
    })

    let watchlistItem

    if (existing) {
      if (existing.deletedAt === null) {
        // Active item exists - no-op (idempotent)
        watchlistItem = existing
      } else {
        // Soft-deleted item exists - resurrect it
        // Per ADR-011A Section 12.1: Clear deletedAt, preserve preferences
        watchlistItem = await tx.watchlist_items.update({
          where: { id: existing.id },
          data: {
            deletedAt: null,
            updatedAt: new Date(),
          },
        })
      }
    } else {
      // No existing item - create new with defaults
      watchlistItem = await tx.watchlist_items.create({
        data: {
          id: randomUUID(),
          userId,
          productId,
          intentType: 'SKU',
          notificationsEnabled: true,
          priceDropEnabled: true,
          backInStockEnabled: true,
          minDropPercent: 5,
          minDropAmount: 5.0,
          stockAlertCooldownHours: 24,
          updatedAt: new Date(),
        },
      })
    }

    // Upsert PRICE_DROP alert
    await tx.alerts.upsert({
      where: {
        userId_productId_ruleType: {
          userId,
          productId,
          ruleType: 'PRICE_DROP',
        },
      },
      create: {
        id: randomUUID(),
        userId,
        productId,
        watchlistItemId: watchlistItem.id,
        ruleType: 'PRICE_DROP',
        isEnabled: true,
        updatedAt: new Date(),
      },
      update: {
        // No-op - alert already exists
        updatedAt: new Date(),
      },
    })

    // Upsert BACK_IN_STOCK alert
    await tx.alerts.upsert({
      where: {
        userId_productId_ruleType: {
          userId,
          productId,
          ruleType: 'BACK_IN_STOCK',
        },
      },
      create: {
        id: randomUUID(),
        userId,
        productId,
        watchlistItemId: watchlistItem.id,
        ruleType: 'BACK_IN_STOCK',
        isEnabled: true,
        updatedAt: new Date(),
      },
      update: {
        // No-op - alert already exists
        updatedAt: new Date(),
      },
    })

    return watchlistItem
  })

  // Fetch full DTO with product info
  return await getSavedItemById(userId, result.id)
}

/**
 * Unsave an item (soft delete)
 *
 * Per ADR-011A Section 12.1: Set deletedAt = now (do not hard delete).
 * Preserves preferences for potential resurrection.
 * Alerts remain linked but will be excluded from evaluation via deletedAt filter.
 */
export async function unsaveItem(
  userId: string,
  productId: string
): Promise<void> {
  const count = await watchlistItemRepository.softDelete(userId, productId)

  if (count === 0) {
    throw new Error('Item not found')
  }
}

/**
 * Get all saved items for a user (active only)
 * Per ADR-011A Section 17.2: All user-facing queries MUST include deletedAt: null
 */
export async function getSavedItems(userId: string): Promise<SavedItemDTO[]> {
  const items = await prisma.watchlist_items.findMany({
    where: { userId, deletedAt: null, intentType: 'SKU', productId: { not: null } },
    include: {
      products: {
        select: {
          id: true,
          name: true,
          brand: true,
          caliber: true,
          imageUrl: true,
          prices: {
            where: {
              inStock: true,
              ...visiblePriceWhere(),
            },
            orderBy: [{ price: 'asc' }],
            take: 1,
            select: {
              price: true,
              inStock: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return items.map(mapToDTO)
}

/**
 * Get a single saved item by WatchlistItem ID (active only)
 * Per ADR-011A Section 17.2: All user-facing queries MUST include deletedAt: null
 */
export async function getSavedItemById(
  userId: string,
  id: string
): Promise<SavedItemDTO> {
  const item = await prisma.watchlist_items.findFirst({
    where: { id, userId, deletedAt: null, intentType: 'SKU', productId: { not: null } },
    include: {
      products: {
        select: {
          id: true,
          name: true,
          brand: true,
          caliber: true,
          imageUrl: true,
          prices: {
            where: {
              inStock: true,
              ...visiblePriceWhere(),
            },
            orderBy: [{ price: 'asc' }],
            take: 1,
            select: {
              price: true,
              inStock: true,
            },
          },
        },
      },
    },
  })

  if (!item) {
    throw new Error('Item not found')
  }

  return mapToDTO(item)
}

/**
 * Get a single saved item by productId (active only)
 * Per ADR-011A Section 17.2: All user-facing queries MUST include deletedAt: null
 */
export async function getSavedItemByProductId(
  userId: string,
  productId: string
): Promise<SavedItemDTO | null> {
  const item = await prisma.watchlist_items.findFirst({
    where: {
      userId,
      productId,
      deletedAt: null,
      intentType: 'SKU',
    },
    include: {
      products: {
        select: {
          id: true,
          name: true,
          brand: true,
          caliber: true,
          imageUrl: true,
          prices: {
            where: {
              inStock: true,
              ...visiblePriceWhere(),
            },
            orderBy: [{ price: 'asc' }],
            take: 1,
            select: {
              price: true,
              inStock: true,
            },
          },
        },
      },
    },
  })

  if (!item) {
    return null
  }

  return mapToDTO(item)
}

/**
 * Update saved item preferences (active items only)
 * Per ADR-011A Section 17.2: All user-facing queries MUST include deletedAt: null
 */
export async function updateSavedItemPrefs(
  userId: string,
  productId: string,
  prefs: UpdatePrefsInput
): Promise<SavedItemDTO> {
  // Validate input
  validatePrefs(prefs)

  // Find existing active item using repository
  const existing = await watchlistItemRepository.findActiveByUserAndProduct(userId, productId)

  if (!existing) {
    throw new Error('Item not found')
  }

  // Update preferences using repository
  await watchlistItemRepository.updatePreferences(existing.id, prefs)

  // Return updated DTO
  return await getSavedItemById(userId, existing.id)
}

/**
 * Count saved items for a user (active only)
 * Per ADR-011A Section 17.2: All user-facing queries MUST include deletedAt: null
 */
export async function countSavedItems(userId: string): Promise<number> {
  return watchlistItemRepository.countForUser(userId)
}

// ============================================================================
// Alert History
// ============================================================================

export interface AlertHistoryEntry {
  id: string
  type: 'PRICE_DROP' | 'BACK_IN_STOCK'
  productId: string
  productName: string
  triggeredAt: string
  reason: string
  metadata: {
    oldPrice?: number
    newPrice?: number
    retailer?: string
  }
}

/**
 * Get alert notification history for a user
 *
 * Queries execution_logs for ALERT_NOTIFY and ALERT_DELAYED_SENT events
 * where the userId matches in the metadata JSON field.
 *
 * Returns notifications in reverse chronological order.
 */
export async function getAlertHistory(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ history: AlertHistoryEntry[]; total: number }> {
  // Query execution_logs for alert notifications sent to this user
  // Using raw query for JSON field filtering
  const [logs, countResult] = await Promise.all([
    prisma.$queryRaw<Array<{
      id: string
      event: string
      message: string
      metadata: any
      timestamp: Date
    }>>`
      SELECT el.id, el.event, el.message, el.metadata, el.timestamp
      FROM execution_logs el
      WHERE el.event IN ('ALERT_NOTIFY', 'ALERT_DELAYED_SENT')
        AND el.metadata->>'userId' = ${userId}
      ORDER BY el.timestamp DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM execution_logs el
      WHERE el.event IN ('ALERT_NOTIFY', 'ALERT_DELAYED_SENT')
        AND el.metadata->>'userId' = ${userId}
    `,
  ])

  const total = Number(countResult[0]?.count ?? 0)

  // Map to AlertHistoryEntry format
  const history: AlertHistoryEntry[] = logs.map((log) => {
    const meta = log.metadata || {}
    const isBackInStock = meta.reason?.includes('BACK_IN_STOCK') ||
                          meta.ruleType === 'BACK_IN_STOCK'

    return {
      id: log.id,
      type: isBackInStock ? 'BACK_IN_STOCK' : 'PRICE_DROP',
      productId: meta.productId || '',
      productName: meta.productName || 'Unknown Product',
      triggeredAt: log.timestamp.toISOString(),
      reason: meta.reason || log.message,
      metadata: {
        oldPrice: meta.oldPrice,
        newPrice: meta.newPrice,
        retailer: meta.retailerName,
      },
    }
  })

  return { history, total }
}

// ============================================================================
// Helpers
// ============================================================================

type WatchlistItemWithProduct = Prisma.watchlist_itemsGetPayload<{
  include: {
    products: {
      select: {
        id: true
        name: true
        brand: true
        caliber: true
        imageUrl: true
        prices: {
          select: {
            price: true
            inStock: true
          }
        }
      }
    }
  }
}>

/**
 * Map a WatchlistItem with product to SavedItemDTO.
 *
 * Per ADR-011A Section 18.5: API mapping layer must not assume product details
 * are always present. In v1 (SKU-only), products should always exist, but we
 * handle gracefully with fallback values.
 */
function mapToDTO(item: WatchlistItemWithProduct): SavedItemDTO {
  const products = item.products
  const lowestPrice = products?.prices[0]

  // v1: SKU intent requires productId. Throw if missing (data integrity issue).
  if (!item.productId) {
    throw new Error(`WatchlistItem ${item.id} missing productId (required for SKU intent)`)
  }

  return {
    id: item.id,
    productId: item.productId,
    name: products?.name || 'Unknown Product',
    brand: products?.brand || '',
    caliber: products?.caliber || '',
    price: lowestPrice ? parseFloat(lowestPrice.price.toString()) : null,
    inStock: (products?.prices.length ?? 0) > 0 && lowestPrice?.inStock === true,
    imageUrl: products?.imageUrl || null,
    savedAt: item.createdAt.toISOString(),

    notificationsEnabled: item.notificationsEnabled,
    priceDropEnabled: item.priceDropEnabled,
    backInStockEnabled: item.backInStockEnabled,
    minDropPercent: item.minDropPercent,
    minDropAmount: parseFloat(item.minDropAmount.toString()),
    stockAlertCooldownHours: item.stockAlertCooldownHours,
  }
}

function validatePrefs(prefs: UpdatePrefsInput): void {
  if (prefs.minDropPercent !== undefined) {
    if (prefs.minDropPercent < PREFS_VALIDATION.minDropPercent.min ||
        prefs.minDropPercent > PREFS_VALIDATION.minDropPercent.max) {
      throw new Error(`minDropPercent must be between ${PREFS_VALIDATION.minDropPercent.min} and ${PREFS_VALIDATION.minDropPercent.max}`)
    }
  }

  if (prefs.minDropAmount !== undefined) {
    if (prefs.minDropAmount < PREFS_VALIDATION.minDropAmount.min) {
      throw new Error(`minDropAmount must be >= ${PREFS_VALIDATION.minDropAmount.min}`)
    }
  }

  if (prefs.stockAlertCooldownHours !== undefined) {
    if (prefs.stockAlertCooldownHours < PREFS_VALIDATION.stockAlertCooldownHours.min ||
        prefs.stockAlertCooldownHours > PREFS_VALIDATION.stockAlertCooldownHours.max) {
      throw new Error(`stockAlertCooldownHours must be between ${PREFS_VALIDATION.stockAlertCooldownHours.min} and ${PREFS_VALIDATION.stockAlertCooldownHours.max}`)
    }
  }
}
