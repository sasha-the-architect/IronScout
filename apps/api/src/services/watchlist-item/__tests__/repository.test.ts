/**
 * ADR-011A: WatchlistItem Repository Tests
 *
 * Tests for the repository that handles WatchlistItem persistence.
 * See: context/decisions/ADR-011A-Intent-Ready-Saved-Items.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock must use inline factory - cannot reference external variables
vi.mock('@ironscout/db', () => ({
  prisma: {
    watchlist_items: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
  },
  Prisma: {},
}))

// Import the mocked prisma after vi.mock
import { prisma } from '@ironscout/db'
const mockPrisma = prisma as any

// Import after mocking
import * as repository from '../repository'

describe('ADR-011A: WatchlistItem Repository', () => {
  const mockRecord = {
    id: 'item-123',
    userId: 'user-456',
    productId: 'product-789',
    intentType: 'SKU',
    querySnapshot: null,
    collectionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    notificationsEnabled: true,
    priceDropEnabled: true,
    backInStockEnabled: true,
    minDropPercent: 5,
    minDropAmount: { toString: () => '5.00' }, // Decimal-like
    stockAlertCooldownHours: 24,
    lastPriceNotifiedAt: null,
    lastStockNotifiedAt: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getManyForResolver', () => {
    it('returns records with productId for resolver use', async () => {
      mockPrisma.watchlist_items.findMany.mockResolvedValue([mockRecord])

      const result = await repository.getManyForResolver(['item-123'])

      expect(result).toHaveLength(1)
      expect(result[0].productId).toBe('product-789')
    })

    it('includes deletedAt: null filter', async () => {
      mockPrisma.watchlist_items.findMany.mockResolvedValue([])

      await repository.getManyForResolver(['item-123'])

      expect(mockPrisma.watchlist_items.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        })
      )
    })

    it('returns empty array for empty input', async () => {
      const result = await repository.getManyForResolver([])

      expect(result).toEqual([])
      expect(mockPrisma.watchlist_items.findMany).not.toHaveBeenCalled()
    })
  })

  describe('listForUser', () => {
    it('returns items without productId exposed', async () => {
      mockPrisma.watchlist_items.findMany.mockResolvedValue([mockRecord])

      const result = await repository.listForUser('user-456')

      expect(result).toHaveLength(1)
      // WatchlistItem type does NOT include productId
      expect((result[0] as any).productId).toBeUndefined()
    })

    it('includes deletedAt: null filter', async () => {
      mockPrisma.watchlist_items.findMany.mockResolvedValue([])

      await repository.listForUser('user-456')

      expect(mockPrisma.watchlist_items.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-456',
            deletedAt: null,
          }),
        })
      )
    })

    it('orders by createdAt desc', async () => {
      mockPrisma.watchlist_items.findMany.mockResolvedValue([])

      await repository.listForUser('user-456')

      expect(mockPrisma.watchlist_items.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      )
    })
  })

  describe('findByUserAndProduct', () => {
    it('includes soft-deleted items for resurrection check', async () => {
      mockPrisma.watchlist_items.findFirst.mockResolvedValue(mockRecord)

      await repository.findByUserAndProduct('user-456', 'product-789')

      // Should NOT include deletedAt filter - needs to find deleted items
      const call = mockPrisma.watchlist_items.findFirst.mock.calls[0][0]
      expect(call.where.deletedAt).toBeUndefined()
    })
  })

  describe('findActiveByUserAndProduct', () => {
    it('includes deletedAt: null filter for active items only', async () => {
      mockPrisma.watchlist_items.findFirst.mockResolvedValue(mockRecord)

      await repository.findActiveByUserAndProduct('user-456', 'product-789')

      expect(mockPrisma.watchlist_items.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-456',
            productId: 'product-789',
            deletedAt: null,
          }),
        })
      )
    })
  })

  describe('softDelete', () => {
    it('sets deletedAt on active items only', async () => {
      mockPrisma.watchlist_items.updateMany.mockResolvedValue({ count: 1 })

      const count = await repository.softDelete('user-456', 'product-789')

      expect(count).toBe(1)
      expect(mockPrisma.watchlist_items.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-456',
          productId: 'product-789',
          deletedAt: null,
        },
        data: {
          deletedAt: expect.any(Date),
        },
      })
    })

    it('returns 0 if no items found to soft delete', async () => {
      mockPrisma.watchlist_items.updateMany.mockResolvedValue({ count: 0 })

      const count = await repository.softDelete('user-456', 'product-789')

      expect(count).toBe(0)
    })
  })

  describe('resurrect', () => {
    it('clears deletedAt to reactivate item', async () => {
      mockPrisma.watchlist_items.update.mockResolvedValue({
        ...mockRecord,
        deletedAt: null,
      })

      const result = await repository.resurrect('item-123')

      expect(mockPrisma.watchlist_items.update).toHaveBeenCalledWith({
        where: { id: 'item-123' },
        data: { deletedAt: null },
      })
      expect(result?.deletedAt).toBeNull()
    })
  })

  describe('create', () => {
    it('creates with intentType SKU for v1', async () => {
      mockPrisma.watchlist_items.create.mockResolvedValue(mockRecord)

      await repository.create({
        userId: 'user-456',
        productId: 'product-789',
      })

      expect(mockPrisma.watchlist_items.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          intentType: 'SKU',
        }),
      })
    })

    it('uses default values when not provided', async () => {
      mockPrisma.watchlist_items.create.mockResolvedValue(mockRecord)

      await repository.create({
        userId: 'user-456',
        productId: 'product-789',
      })

      expect(mockPrisma.watchlist_items.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          notificationsEnabled: true,
          priceDropEnabled: true,
          backInStockEnabled: true,
          minDropPercent: 5,
          minDropAmount: 5.0,
          stockAlertCooldownHours: 24,
        }),
      })
    })

    it('uses provided values over defaults', async () => {
      mockPrisma.watchlist_items.create.mockResolvedValue(mockRecord)

      await repository.create({
        userId: 'user-456',
        productId: 'product-789',
        notificationsEnabled: false,
        minDropPercent: 10,
        minDropAmount: 15.0,
        stockAlertCooldownHours: 48,
      })

      expect(mockPrisma.watchlist_items.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          notificationsEnabled: false,
          minDropPercent: 10,
          minDropAmount: 15.0,
          stockAlertCooldownHours: 48,
        }),
      })
    })
  })

  describe('countForUser', () => {
    it('counts only active items', async () => {
      mockPrisma.watchlist_items.count.mockResolvedValue(5)

      const count = await repository.countForUser('user-456')

      expect(count).toBe(5)
      expect(mockPrisma.watchlist_items.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-456',
          deletedAt: null,
        },
      })
    })
  })

  describe('minDropAmount conversion', () => {
    it('converts Decimal to number in mapToRecord', async () => {
      mockPrisma.watchlist_items.findMany.mockResolvedValue([mockRecord])

      const result = await repository.getManyForResolver(['item-123'])

      expect(typeof result[0].minDropAmount).toBe('number')
      expect(result[0].minDropAmount).toBe(5.0)
    })
  })
})
