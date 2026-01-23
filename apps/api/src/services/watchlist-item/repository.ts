/**
 * WatchlistItemRepository
 *
 * Per ADR-011A Section 6.2: Repository contracts.
 * - getManyForResolver: internal only, returns WatchlistItemRecord with productId
 * - listForUser: public, returns WatchlistItem without productId
 *
 * All methods exclude soft-deleted items unless explicitly requested.
 *
 * See: context/decisions/ADR-017-Intent-Ready-Saved-Items.md
 */

import crypto from 'crypto'
import { prisma, Prisma } from '@ironscout/db'
import {
  WatchlistItem,
  WatchlistItemRecord,
  IntentType,
  QuerySnapshot,
} from './types'

// ============================================================================
// Constants
// ============================================================================

/**
 * Base where clause for active items.
 * Per ADR-011A Section 17.2: All user-facing queries MUST include deletedAt: null
 */
const ACTIVE_FILTER: Prisma.watchlist_itemsWhereInput = {
  deletedAt: null,
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get records for resolver (internal only).
 * Includes productId for resolution.
 *
 * Per ADR-011A Section 6.2: Only resolver/repo should use this.
 */
export async function getManyForResolver(
  ids: string[]
): Promise<WatchlistItemRecord[]> {
  if (ids.length === 0) return []

  const records = await prisma.watchlist_items.findMany({
    where: {
      id: { in: ids },
      ...ACTIVE_FILTER,
    },
  })

  return records.map(mapToRecord)
}

/**
 * List items for a user (no productId exposed).
 *
 * Per ADR-011A Section 6.2: Returns WatchlistItem without productId.
 */
export async function listForUser(userId: string): Promise<WatchlistItem[]> {
  const records = await prisma.watchlist_items.findMany({
    where: {
      userId,
      ...ACTIVE_FILTER,
    },
    orderBy: { createdAt: 'desc' },
  })

  return records.map(mapToItem)
}

/**
 * Find by user and product (includes soft-deleted for resurrection).
 * Per ADR-011A Section 12.1.
 *
 * Note: This intentionally includes soft-deleted items to support resurrection.
 */
export async function findByUserAndProduct(
  userId: string,
  productId: string
): Promise<WatchlistItemRecord | null> {
  const record = await prisma.watchlist_items.findFirst({
    where: { userId, productId }, // Includes soft-deleted
  })

  return record ? mapToRecord(record) : null
}

/**
 * Find active item by user and product.
 */
export async function findActiveByUserAndProduct(
  userId: string,
  productId: string
): Promise<WatchlistItemRecord | null> {
  const record = await prisma.watchlist_items.findFirst({
    where: {
      userId,
      productId,
      ...ACTIVE_FILTER,
    },
  })

  return record ? mapToRecord(record) : null
}

/**
 * Find by ID (active only).
 */
export async function findById(
  id: string,
  userId?: string
): Promise<WatchlistItemRecord | null> {
  const record = await prisma.watchlist_items.findFirst({
    where: {
      id,
      ...ACTIVE_FILTER,
      ...(userId ? { userId } : {}),
    },
  })

  return record ? mapToRecord(record) : null
}

/**
 * Count active items for a user.
 */
export async function countForUser(userId: string): Promise<number> {
  return prisma.watchlist_items.count({
    where: {
      userId,
      ...ACTIVE_FILTER,
    },
  })
}

/**
 * Get items with associated alerts for a user (for alerter).
 * Returns records with productId for alert evaluation.
 */
export async function getActiveWithAlerts(userId: string): Promise<WatchlistItemRecord[]> {
  const records = await prisma.watchlist_items.findMany({
    where: {
      userId,
      ...ACTIVE_FILTER,
      notificationsEnabled: true,
    },
    include: {
      alerts: {
        where: { isEnabled: true },
      },
    },
  })

  return records.map(mapToRecord)
}

// ============================================================================
// Mutation Functions
// ============================================================================

/**
 * Soft delete a watchlist item.
 * Per ADR-011A Section 12.1: Set deletedAt = now (do not hard delete).
 *
 * Returns the number of items updated.
 */
export async function softDelete(
  userId: string,
  productId: string
): Promise<number> {
  const result = await prisma.watchlist_items.updateMany({
    where: {
      userId,
      productId,
      ...ACTIVE_FILTER, // Only soft-delete active items
    },
    data: {
      deletedAt: new Date(),
    },
  })

  return result.count
}

/**
 * Resurrect a soft-deleted watchlist item.
 * Per ADR-011A Section 12.1: Clear deletedAt, preserve preferences.
 */
export async function resurrect(id: string): Promise<WatchlistItemRecord | null> {
  const record = await prisma.watchlist_items.update({
    where: { id },
    data: { deletedAt: null },
  })

  return mapToRecord(record)
}

/**
 * Create a new watchlist item.
 * Per ADR-011A Section 19.2: Only SKU intent is allowed in v1.
 */
export async function create(data: {
  userId: string
  productId: string
  collectionId?: string
  notificationsEnabled?: boolean
  priceDropEnabled?: boolean
  backInStockEnabled?: boolean
  minDropPercent?: number
  minDropAmount?: number
  stockAlertCooldownHours?: number
}): Promise<WatchlistItemRecord> {
  const record = await prisma.watchlist_items.create({
    data: {
      id: crypto.randomUUID(),
      userId: data.userId,
      productId: data.productId,
      collectionId: data.collectionId,
      intentType: 'SKU', // v1: always SKU
      notificationsEnabled: data.notificationsEnabled ?? true,
      priceDropEnabled: data.priceDropEnabled ?? true,
      backInStockEnabled: data.backInStockEnabled ?? true,
      minDropPercent: data.minDropPercent ?? 5,
      minDropAmount: data.minDropAmount ?? 5.0,
      stockAlertCooldownHours: data.stockAlertCooldownHours ?? 24,
      updatedAt: new Date(),
    },
  })

  return mapToRecord(record)
}

/**
 * Update notification timestamps.
 * Per ADR-011A Section 11: Alerter updates these after sending notifications.
 */
export async function updateNotificationTimestamps(
  id: string,
  data: {
    lastPriceNotifiedAt?: Date
    lastStockNotifiedAt?: Date
  }
): Promise<void> {
  await prisma.watchlist_items.update({
    where: { id },
    data,
  })
}

/**
 * Update notification preferences for a watchlist item.
 */
export async function updatePreferences(
  id: string,
  prefs: {
    notificationsEnabled?: boolean
    priceDropEnabled?: boolean
    backInStockEnabled?: boolean
    minDropPercent?: number
    minDropAmount?: number
    stockAlertCooldownHours?: number
  }
): Promise<WatchlistItemRecord> {
  const record = await prisma.watchlist_items.update({
    where: { id },
    data: prefs,
  })

  return mapToRecord(record)
}

// ============================================================================
// Mappers
// ============================================================================

type PrismaWatchlistItem = Prisma.watchlist_itemsGetPayload<{}>

/**
 * Map Prisma record to WatchlistItemRecord (includes productId).
 */
function mapToRecord(row: PrismaWatchlistItem): WatchlistItemRecord {
  return {
    id: row.id,
    userId: row.userId,
    productId: row.productId,
    intentType: row.intentType as IntentType,
    querySnapshot: row.querySnapshot as QuerySnapshot | null,
    collectionId: row.collectionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    notificationsEnabled: row.notificationsEnabled,
    priceDropEnabled: row.priceDropEnabled,
    backInStockEnabled: row.backInStockEnabled,
    minDropPercent: row.minDropPercent,
    minDropAmount: parseFloat(row.minDropAmount.toString()),
    stockAlertCooldownHours: row.stockAlertCooldownHours,
    lastPriceNotifiedAt: row.lastPriceNotifiedAt,
    lastStockNotifiedAt: row.lastStockNotifiedAt,
  }
}

/**
 * Map Prisma record to WatchlistItem (no productId exposed).
 * Per ADR-011A Section 6.1: productId not accessible outside repo + resolver.
 */
function mapToItem(row: PrismaWatchlistItem): WatchlistItem {
  return {
    id: row.id,
    userId: row.userId,
    intentType: row.intentType as IntentType,
    querySnapshot: row.querySnapshot as QuerySnapshot | null,
    collectionId: row.collectionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    notificationsEnabled: row.notificationsEnabled,
    priceDropEnabled: row.priceDropEnabled,
    backInStockEnabled: row.backInStockEnabled,
    minDropPercent: row.minDropPercent,
    minDropAmount: parseFloat(row.minDropAmount.toString()),
    stockAlertCooldownHours: row.stockAlertCooldownHours,
    lastPriceNotifiedAt: row.lastPriceNotifiedAt,
    lastStockNotifiedAt: row.lastStockNotifiedAt,
  }
}
