/**
 * ADR-011A: WatchlistItem Resolver Tests
 *
 * Tests for the resolver that maps WatchlistItems to product IDs.
 * See: context/decisions/ADR-011A-Intent-Ready-Saved-Items.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock must use inline factory - cannot reference external variables
vi.mock('@ironscout/db', () => ({
  prisma: {
    watchlist_items: {
      findMany: vi.fn(),
    },
  },
}))

// Import the mocked prisma after vi.mock
import { prisma } from '@ironscout/db'
const mockPrisma = prisma as any

// Import after mocking
import { WatchlistItemResolver, watchlistItemResolver } from '../resolver'
import { NotImplementedError } from '../types'

describe('ADR-011A: WatchlistItemResolver', () => {
  let resolver: WatchlistItemResolver

  beforeEach(() => {
    vi.clearAllMocks()
    resolver = new WatchlistItemResolver()
  })

  describe('resolve (single item)', () => {
    it('returns productIds for SKU intent item', async () => {
      mockPrisma.watchlist_items.findMany.mockResolvedValue([
        {
          id: 'item-123',
          intentType: 'SKU',
          productId: 'product-456',
        },
      ])

      const result = await resolver.resolve('item-123')

      expect(result.productIds).toEqual(['product-456'])
      expect(result.resolvedAt).toBeInstanceOf(Date)
    })

    it('returns empty productIds for non-existent item', async () => {
      mockPrisma.watchlist_items.findMany.mockResolvedValue([])

      const result = await resolver.resolve('non-existent')

      expect(result.productIds).toEqual([])
      expect(result.resolvedAt).toBeInstanceOf(Date)
    })

    it('excludes soft-deleted items (deletedAt filter)', async () => {
      mockPrisma.watchlist_items.findMany.mockResolvedValue([])

      await resolver.resolve('item-123')

      expect(mockPrisma.watchlist_items.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        })
      )
    })

    it('filters by userId when provided in options', async () => {
      mockPrisma.watchlist_items.findMany.mockResolvedValue([])

      await resolver.resolve('item-123', { userId: 'user-456' })

      expect(mockPrisma.watchlist_items.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-456',
          }),
        })
      )
    })
  })

  describe('resolveMany (batch)', () => {
    it('returns Map of item IDs to resolutions', async () => {
      mockPrisma.watchlist_items.findMany.mockResolvedValue([
        { id: 'item-1', intentType: 'SKU', productId: 'product-1' },
        { id: 'item-2', intentType: 'SKU', productId: 'product-2' },
        { id: 'item-3', intentType: 'SKU', productId: 'product-3' },
      ])

      const result = await resolver.resolveMany(['item-1', 'item-2', 'item-3'])

      expect(result.size).toBe(3)
      expect(result.get('item-1')?.productIds).toEqual(['product-1'])
      expect(result.get('item-2')?.productIds).toEqual(['product-2'])
      expect(result.get('item-3')?.productIds).toEqual(['product-3'])
    })

    it('omits non-existent items from result Map', async () => {
      mockPrisma.watchlist_items.findMany.mockResolvedValue([
        { id: 'item-1', intentType: 'SKU', productId: 'product-1' },
        // item-2 not returned (doesn't exist)
      ])

      const result = await resolver.resolveMany(['item-1', 'item-2'])

      expect(result.size).toBe(1)
      expect(result.has('item-1')).toBe(true)
      expect(result.has('item-2')).toBe(false)
    })

    it('omits soft-deleted items from result Map', async () => {
      // The query itself filters by deletedAt: null, so deleted items
      // won't be returned from the database
      mockPrisma.watchlist_items.findMany.mockResolvedValue([
        { id: 'item-1', intentType: 'SKU', productId: 'product-1' },
        // item-2 is deleted, so not returned
      ])

      const result = await resolver.resolveMany(['item-1', 'item-2'])

      expect(result.size).toBe(1)
      expect(result.has('item-2')).toBe(false)
    })

    it('fetches all items in single query (no N+1)', async () => {
      mockPrisma.watchlist_items.findMany.mockResolvedValue([])

      await resolver.resolveMany(['item-1', 'item-2', 'item-3', 'item-4', 'item-5'])

      // Should only call findMany once, not 5 times
      expect(mockPrisma.watchlist_items.findMany).toHaveBeenCalledTimes(1)
      expect(mockPrisma.watchlist_items.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['item-1', 'item-2', 'item-3', 'item-4', 'item-5'] },
          }),
        })
      )
    })

    it('returns empty Map for empty input', async () => {
      const result = await resolver.resolveMany([])

      expect(result.size).toBe(0)
      expect(mockPrisma.watchlist_items.findMany).not.toHaveBeenCalled()
    })

    it('handles items with null productId (returns empty array)', async () => {
      mockPrisma.watchlist_items.findMany.mockResolvedValue([
        { id: 'item-1', intentType: 'SKU', productId: null },
      ])

      const result = await resolver.resolveMany(['item-1'])

      expect(result.get('item-1')?.productIds).toEqual([])
    })
  })

  describe('SEARCH intent gating', () => {
    it('throws NotImplementedError for SEARCH intent', async () => {
      mockPrisma.watchlist_items.findMany.mockResolvedValue([
        { id: 'item-1', intentType: 'SEARCH', productId: null },
      ])

      await expect(resolver.resolveMany(['item-1'])).rejects.toThrow(
        NotImplementedError
      )
      await expect(resolver.resolveMany(['item-1'])).rejects.toThrow(
        'SEARCH intent resolution is not implemented'
      )
    })

    it('throws even when mixed with SKU items', async () => {
      mockPrisma.watchlist_items.findMany.mockResolvedValue([
        { id: 'item-1', intentType: 'SKU', productId: 'product-1' },
        { id: 'item-2', intentType: 'SEARCH', productId: null },
      ])

      await expect(resolver.resolveMany(['item-1', 'item-2'])).rejects.toThrow(
        NotImplementedError
      )
    })
  })

  describe('singleton instance', () => {
    it('exports a singleton resolver instance', () => {
      expect(watchlistItemResolver).toBeInstanceOf(WatchlistItemResolver)
    })
  })
})
