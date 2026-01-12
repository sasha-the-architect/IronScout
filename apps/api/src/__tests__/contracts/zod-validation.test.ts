/**
 * Zod Validation Contract Tests
 *
 * Validates that API request/response schemas correctly
 * accept valid payloads and reject invalid ones.
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// ============================================================================
// API Schemas (representative examples from the codebase)
// ============================================================================

// Search request schema
const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  filters: z
    .object({
      caliber: z.string().optional(),
      brand: z.string().optional(),
      minPrice: z.number().min(0).optional(),
      maxPrice: z.number().min(0).optional(),
      inStock: z.boolean().optional(),
    })
    .optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  sort: z.enum(['price_asc', 'price_desc', 'relevance', 'newest']).optional(),
})

// Watchlist item creation schema
const WatchlistItemCreateSchema = z.object({
  productId: z.string().uuid(),
  alertOnPriceDrop: z.boolean().default(true),
  alertOnBackInStock: z.boolean().default(true),
  targetPrice: z.number().min(0).optional(),
  notes: z.string().max(500).optional(),
})

// User preferences schema
const UserPreferencesSchema = z.object({
  email: z.string().email(),
  emailNotifications: z.boolean(),
  alertFrequency: z.enum(['IMMEDIATE', 'DAILY', 'WEEKLY']),
  preferredCalibers: z.array(z.string()).max(20).optional(),
  timezone: z.string().optional(),
})

// Affiliate feed config schema
const AffiliateFeedConfigSchema = z.object({
  name: z.string().min(1).max(100),
  transport: z.enum(['FTP', 'SFTP', 'HTTP']),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  path: z.string().min(1),
  username: z.string().optional(),
  format: z.enum(['CSV', 'XML', 'JSON']),
  scheduleFrequencyHours: z.number().int().min(1).max(168),
  expiryHours: z.number().int().min(1).max(720),
  maxRowCount: z.number().int().min(100).max(1000000).default(500000),
})

// ============================================================================
// Contract Tests
// ============================================================================

describe('API Request Schema Contracts', () => {
  describe('SearchRequestSchema', () => {
    it('should accept valid search request', () => {
      const valid = {
        query: '9mm ammo',
        filters: {
          caliber: '9mm',
          inStock: true,
          minPrice: 10,
          maxPrice: 50,
        },
        page: 1,
        pageSize: 20,
        sort: 'price_asc',
      }

      const result = SearchRequestSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })

    it('should accept minimal search request', () => {
      const minimal = { query: 'ammo' }

      const result = SearchRequestSchema.safeParse(minimal)
      expect(result.success).toBe(true)

      if (result.success) {
        // Check defaults applied
        expect(result.data.page).toBe(1)
        expect(result.data.pageSize).toBe(20)
      }
    })

    it('should reject empty query', () => {
      const invalid = { query: '' }

      const result = SearchRequestSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })

    it('should reject query over 500 chars', () => {
      const invalid = { query: 'a'.repeat(501) }

      const result = SearchRequestSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })

    it('should reject negative price filters', () => {
      const invalid = {
        query: 'ammo',
        filters: { minPrice: -10 },
      }

      const result = SearchRequestSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })

    it('should reject invalid sort option', () => {
      const invalid = {
        query: 'ammo',
        sort: 'invalid_sort',
      }

      const result = SearchRequestSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })

    it('should reject page size over 100', () => {
      const invalid = {
        query: 'ammo',
        pageSize: 200,
      }

      const result = SearchRequestSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })
  })

  describe('WatchlistItemCreateSchema', () => {
    it('should accept valid watchlist item', () => {
      const valid = {
        productId: '123e4567-e89b-12d3-a456-426614174000',
        alertOnPriceDrop: true,
        alertOnBackInStock: true,
        targetPrice: 25.99,
        notes: 'Good deal target',
      }

      const result = WatchlistItemCreateSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })

    it('should accept minimal watchlist item', () => {
      const minimal = {
        productId: '123e4567-e89b-12d3-a456-426614174000',
      }

      const result = WatchlistItemCreateSchema.safeParse(minimal)
      expect(result.success).toBe(true)

      if (result.success) {
        // Check defaults
        expect(result.data.alertOnPriceDrop).toBe(true)
        expect(result.data.alertOnBackInStock).toBe(true)
      }
    })

    it('should reject invalid UUID', () => {
      const invalid = {
        productId: 'not-a-uuid',
      }

      const result = WatchlistItemCreateSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })

    it('should reject negative target price', () => {
      const invalid = {
        productId: '123e4567-e89b-12d3-a456-426614174000',
        targetPrice: -10,
      }

      const result = WatchlistItemCreateSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })

    it('should reject notes over 500 chars', () => {
      const invalid = {
        productId: '123e4567-e89b-12d3-a456-426614174000',
        notes: 'a'.repeat(501),
      }

      const result = WatchlistItemCreateSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })
  })

  describe('UserPreferencesSchema', () => {
    it('should accept valid preferences', () => {
      const valid = {
        email: 'user@example.com',
        emailNotifications: true,
        alertFrequency: 'DAILY',
        preferredCalibers: ['9mm', '.45 ACP'],
        timezone: 'America/New_York',
      }

      const result = UserPreferencesSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })

    it('should reject invalid email', () => {
      const invalid = {
        email: 'not-an-email',
        emailNotifications: true,
        alertFrequency: 'DAILY',
      }

      const result = UserPreferencesSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })

    it('should reject invalid alert frequency', () => {
      const invalid = {
        email: 'user@example.com',
        emailNotifications: true,
        alertFrequency: 'HOURLY', // Not a valid option
      }

      const result = UserPreferencesSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })

    it('should reject too many preferred calibers', () => {
      const invalid = {
        email: 'user@example.com',
        emailNotifications: true,
        alertFrequency: 'DAILY',
        preferredCalibers: Array(25).fill('9mm'),
      }

      const result = UserPreferencesSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })
  })

  describe('AffiliateFeedConfigSchema', () => {
    it('should accept valid feed config', () => {
      const valid = {
        name: 'Test Retailer Feed',
        transport: 'SFTP',
        host: 'ftp.example.com',
        port: 22,
        path: '/feeds/products.csv',
        username: 'feeduser',
        format: 'CSV',
        scheduleFrequencyHours: 24,
        expiryHours: 72,
        maxRowCount: 500000,
      }

      const result = AffiliateFeedConfigSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })

    it('should apply default maxRowCount', () => {
      const minimal = {
        name: 'Feed',
        transport: 'FTP',
        host: 'ftp.example.com',
        port: 21,
        path: '/feed.csv',
        format: 'CSV',
        scheduleFrequencyHours: 12,
        expiryHours: 48,
      }

      const result = AffiliateFeedConfigSchema.safeParse(minimal)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.maxRowCount).toBe(500000)
      }
    })

    it('should reject invalid port', () => {
      const invalid = {
        name: 'Feed',
        transport: 'SFTP',
        host: 'ftp.example.com',
        port: 70000, // Invalid port
        path: '/feed.csv',
        format: 'CSV',
        scheduleFrequencyHours: 24,
        expiryHours: 72,
      }

      const result = AffiliateFeedConfigSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })

    it('should reject invalid transport', () => {
      const invalid = {
        name: 'Feed',
        transport: 'HTTPS', // Not in enum
        host: 'ftp.example.com',
        port: 443,
        path: '/feed.csv',
        format: 'CSV',
        scheduleFrequencyHours: 24,
        expiryHours: 72,
      }

      const result = AffiliateFeedConfigSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })

    it('should reject schedule frequency over 168 hours (1 week)', () => {
      const invalid = {
        name: 'Feed',
        transport: 'SFTP',
        host: 'ftp.example.com',
        port: 22,
        path: '/feed.csv',
        format: 'CSV',
        scheduleFrequencyHours: 200, // Over 1 week
        expiryHours: 72,
      }

      const result = AffiliateFeedConfigSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })
  })
})

describe('Response Schema Validation', () => {
  // API response wrapper - use simpler schema for Zod v4 compatibility
  const ErrorSchema = z.object({
    code: z.string(),
    message: z.string(),
  })

  const MetaSchema = z.object({
    page: z.number().int().optional(),
    pageSize: z.number().int().optional(),
    totalCount: z.number().int().optional(),
    hasMore: z.boolean().optional(),
  })

  const ApiResponseSchema = z.object({
    success: z.boolean(),
    data: z.any().optional(),
    error: ErrorSchema.optional(),
    meta: MetaSchema.optional(),
  })

  it('should validate success response', () => {
    const response = {
      success: true,
      data: [{ id: '1', name: 'Product' }],
      meta: {
        page: 1,
        pageSize: 20,
        totalCount: 100,
        hasMore: true,
      },
    }

    const result = ApiResponseSchema.safeParse(response)
    expect(result.success).toBe(true)
  })

  it('should validate error response', () => {
    const response = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
      },
    }

    const result = ApiResponseSchema.safeParse(response)
    expect(result.success).toBe(true)
  })

  it('should reject response without success flag', () => {
    const response = {
      data: [{ id: '1' }],
    }

    const result = ApiResponseSchema.safeParse(response)
    expect(result.success).toBe(false)
  })
})
