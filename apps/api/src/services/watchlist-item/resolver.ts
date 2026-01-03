/**
 * WatchlistItemResolver
 *
 * Per ADR-011A Section 7: Provides a seam for product resolution.
 * v1: SKU intent returns [productId]. SEARCH throws NotImplementedError.
 *
 * CRITICAL: All product resolution MUST go through this resolver.
 * Direct productId access outside resolver/repo is forbidden.
 *
 * See: context/decisions/ADR-011A-Intent-Ready-Saved-Items.md
 */

import { prisma } from '@ironscout/db'
import {
  WatchlistItemResolution,
  ResolveOptions,
  NotImplementedError,
  IWatchlistItemResolver,
} from './types'

/**
 * WatchlistItemResolver implementation.
 *
 * Resolves WatchlistItems to their associated product IDs.
 * This abstraction allows future SEARCH intent to resolve to multiple products
 * without changing downstream code.
 */
export class WatchlistItemResolver implements IWatchlistItemResolver {
  /**
   * Resolve a single item to its product IDs.
   * Delegates to resolveMany for consistency.
   *
   * Per ADR-011A Section 7.1: resolve can delegate to resolveMany.
   */
  async resolve(
    itemId: string,
    opts?: ResolveOptions
  ): Promise<WatchlistItemResolution> {
    const results = await this.resolveMany([itemId], opts)
    const resolution = results.get(itemId)

    if (!resolution) {
      // Item not found or soft-deleted
      // Per ADR-011A Section 8: return empty productIds, not an error
      return { productIds: [], resolvedAt: new Date() }
    }

    return resolution
  }

  /**
   * Batch resolve multiple items to their product IDs.
   *
   * Per ADR-011A Section 7.1:
   * - Returns Map<itemId, Resolution>
   * - Missing or deleted items are omitted from the map
   * - MUST fetch in one query to avoid N+1
   *
   * Per ADR-011A Section 17.1:
   * - Non-existent IDs: omitted from returned Map
   * - Soft-deleted IDs: omitted from returned Map
   */
  async resolveMany(
    itemIds: string[],
    opts?: ResolveOptions
  ): Promise<Map<string, WatchlistItemResolution>> {
    if (itemIds.length === 0) {
      return new Map()
    }

    // Single query for all items (no N+1)
    // Per ADR-011A Section 17.2: active items only (deletedAt IS NULL)
    const records = await prisma.watchlist_items.findMany({
      where: {
        id: { in: itemIds },
        deletedAt: null,
        ...(opts?.userId ? { userId: opts.userId } : {}),
      },
      select: {
        id: true,
        intentType: true,
        productId: true,
      },
    })

    const results = new Map<string, WatchlistItemResolution>()
    const now = new Date()

    for (const record of records) {
      // Per ADR-011A Section 19.2: SEARCH is gated in v1
      if (record.intentType === 'SEARCH') {
        throw new NotImplementedError('SEARCH intent resolution')
      }

      // SKU intent: productIds = [productId]
      // Per ADR-011A Section 7.2
      const productIds = record.productId ? [record.productId] : []

      results.set(record.id, {
        productIds,
        resolvedAt: now,
      })
    }

    return results
  }
}

/**
 * Singleton resolver instance.
 *
 * Use this instance throughout the application to ensure consistent
 * resolution behavior and enable future caching if needed.
 */
export const watchlistItemResolver = new WatchlistItemResolver()
