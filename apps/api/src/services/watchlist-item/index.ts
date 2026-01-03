/**
 * WatchlistItem Service Module
 *
 * ADR-011A: Intent-Ready Saved Items (WatchlistItem Resolver Seam)
 *
 * This module provides the internal architecture for WatchlistItems,
 * supporting SKU intent (v1) with schema-level preparation for future SEARCH intent.
 *
 * Terminology (per ADR-011A Section 1):
 * - User-facing: "Saved Item"
 * - Internal/domain + DB: WatchlistItem
 * - API DTO: SavedItemDTO (in saved-items.ts)
 *
 * See: context/decisions/ADR-011A-Intent-Ready-Saved-Items.md
 */

// Types
export type {
  IntentType,
  QuerySnapshot,
  QuerySnapshotV1,
  WatchlistItem,
  WatchlistItemRecord,
  WatchlistItemResolution,
  ResolveOptions,
  IWatchlistItemResolver,
} from './types'

export {
  NotImplementedError,
  WatchlistItemNotFoundError,
} from './types'

// Resolver
export {
  WatchlistItemResolver,
  watchlistItemResolver,
} from './resolver'

// Repository
export * as watchlistItemRepository from './repository'
