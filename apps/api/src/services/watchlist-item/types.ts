/**
 * ADR-011A: Intent-Ready Saved Items Types
 *
 * Domain types for WatchlistItem (internal) / SavedItem (user-facing).
 * See: context/decisions/ADR-011A-Intent-Ready-Saved-Items.md
 *
 * Terminology (per ADR-011A Section 1):
 * - User-facing: "Saved Item"
 * - Internal/domain + DB: WatchlistItem
 * - API DTO: SavedItemDTO (unchanged, defined in saved-items.ts)
 */

// ============================================================================
// Intent Types
// ============================================================================

/**
 * Intent types for WatchlistItem.
 * v1: Only SKU is implemented. SEARCH is gated per ADR-011A Section 19.2.
 */
export type IntentType = 'SKU' | 'SEARCH'

/**
 * QuerySnapshot for SEARCH intent (future).
 * Versioned for forward compatibility per ADR-011A Section 5.
 */
export interface QuerySnapshotV1 {
  version: 1
  searchText?: string
  filters?: {
    caliber?: string[]
    brand?: string[]
    priceRange?: { min?: number; max?: number }
  }
  sortBy?: string
}

export type QuerySnapshot = QuerySnapshotV1

// ============================================================================
// Domain Models
// ============================================================================

/**
 * Internal domain model (no productId exposed).
 * Per ADR-011A Section 6.1.
 *
 * This is what downstream code (dashboard, alerter, API handlers) should use.
 * productId is NOT exposed - use the resolver to get product IDs.
 */
export interface WatchlistItem {
  id: string
  userId: string
  intentType: IntentType
  querySnapshot: QuerySnapshot | null
  collectionId: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null

  // Alert configuration (per ADR-011)
  notificationsEnabled: boolean
  priceDropEnabled: boolean
  backInStockEnabled: boolean
  minDropPercent: number
  minDropAmount: number
  stockAlertCooldownHours: number
  lastPriceNotifiedAt: Date | null
  lastStockNotifiedAt: Date | null
}

/**
 * Internal record with productId (only for resolver/repo).
 * Per ADR-011A Section 6.1.
 *
 * IMPORTANT: Only the resolver and repository should use this type.
 * All other code should use WatchlistItem (without productId).
 */
export interface WatchlistItemRecord extends WatchlistItem {
  productId: string | null
}

// ============================================================================
// Resolver Types
// ============================================================================

/**
 * Resolution result from resolver.
 * Per ADR-011A Section 7.1.
 */
export interface WatchlistItemResolution {
  productIds: string[]
  resolvedAt: Date
}

/**
 * Resolver options.
 */
export interface ResolveOptions {
  userId?: string
}

/**
 * Resolver interface.
 * Per ADR-011A Section 7.1.
 */
export interface IWatchlistItemResolver {
  /**
   * Resolve a single item to its product IDs.
   */
  resolve(itemId: string, opts?: ResolveOptions): Promise<WatchlistItemResolution>

  /**
   * Batch resolve multiple items to their product IDs.
   * This is the required method for hot paths (dashboard, alert cycles).
   */
  resolveMany(
    itemIds: string[],
    opts?: ResolveOptions
  ): Promise<Map<string, WatchlistItemResolution>>
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Typed error for unimplemented features.
 * Per ADR-011A Section 17.7.
 */
export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} is not implemented`)
    this.name = 'NotImplementedError'
  }
}

/**
 * Error thrown when a watchlist item is not found.
 */
export class WatchlistItemNotFoundError extends Error {
  constructor(id: string) {
    super(`WatchlistItem not found: ${id}`)
    this.name = 'WatchlistItemNotFoundError'
  }
}
