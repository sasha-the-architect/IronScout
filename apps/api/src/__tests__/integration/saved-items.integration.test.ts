/**
 * Saved Items API Integration Tests
 *
 * Tests the /api/saved-items endpoints with real database.
 * Demonstrates:
 * - Authentication testing with JWT
 * - CRUD operations
 * - Error handling
 * - Database state verification
 *
 * REQUIRES: Test containers running (pnpm test:up)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import type { Express } from 'express'
import type { PrismaClient } from '@ironscout/db'

// Test configuration - set before dynamic imports
const TEST_DATABASE_URL = 'postgresql://ironscout_test:ironscout_test@localhost:5433/ironscout_test'
const TEST_REDIS_URL = 'redis://localhost:6380'
const JWT_SECRET = 'test-jwt-secret-for-integration-tests'

// Will be loaded dynamically after env setup
let app: Express
let createTestClient: any
let disconnectTestClient: any
let cleanTables: any
let createTestUser: any
let createTestProduct: any

/**
 * Create a valid JWT token for testing
 */
function createAuthToken(userId: string, email?: string): string {
  return jwt.sign(
    {
      sub: userId,
      email: email || `${userId}@test.local`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    },
    JWT_SECRET
  )
}

describe('/api/saved-items', () => {
  let prisma: PrismaClient
  let testUser: { id: string; email: string }
  let testProduct: { id: string; name: string }
  let authToken: string

  beforeAll(async () => {
    // Set environment BEFORE importing app (which loads .env)
    process.env.NODE_ENV = 'test'
    process.env.DATABASE_URL = TEST_DATABASE_URL
    process.env.REDIS_URL = TEST_REDIS_URL
    process.env.NEXTAUTH_SECRET = JWT_SECRET

    // Dynamic import after env setup
    const appModule = await import('../../app')
    app = appModule.app

    const testUtils = await import('@ironscout/db/test-utils')
    createTestClient = testUtils.createTestClient
    disconnectTestClient = testUtils.disconnectTestClient
    cleanTables = testUtils.cleanTables
    createTestUser = testUtils.createTestUser
    createTestProduct = testUtils.createTestProduct

    prisma = createTestClient()
    // Note: Assumes test database schema is already migrated.
    // Run `pnpm test:up && pnpm db:push --force-reset` before running integration tests.
    await prisma.$connect()
  })

  afterAll(async () => {
    await disconnectTestClient(prisma)
  })

  beforeEach(async () => {
    // Clean relevant tables before each test
    // Table names must match PostgreSQL table names (snake_case)
    await cleanTables(prisma, ['alerts', 'watchlist_items', 'prices', 'products', 'users'])

    // Create test fixtures
    testUser = await createTestUser(prisma, { id: 'test-user-1' })
    testProduct = await createTestProduct(prisma, { id: 'test-product-1' })
    authToken = createAuthToken(testUser.id)
  })

  describe('GET /api/saved-items', () => {
    it('returns 401 without authentication', async () => {
      const res = await request(app)
        .get('/api/saved-items')
        .expect(401)

      expect(res.body.error).toBe('Authentication required')
    })

    it('returns empty list for new user', async () => {
      const res = await request(app)
        .get('/api/saved-items')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(res.body.items).toEqual([])
      expect(res.body._meta.itemCount).toBe(0)
      expect(res.body._meta.canAddMore).toBe(true)
    })

    it('returns saved items for user', async () => {
      // Save an item first
      await request(app)
        .post(`/api/saved-items/${testProduct.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201)

      const res = await request(app)
        .get('/api/saved-items')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(res.body.items).toHaveLength(1)
      expect(res.body.items[0].productId).toBe(testProduct.id)
      expect(res.body._meta.itemCount).toBe(1)
    })
  })

  describe('POST /api/saved-items/:productId', () => {
    it('saves an item successfully', async () => {
      const res = await request(app)
        .post(`/api/saved-items/${testProduct.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201)

      expect(res.body.productId).toBe(testProduct.id)
      expect(res.body.notificationsEnabled).toBe(true)
      expect(res.body._meta.wasExisting).toBe(false)
    })

    it('returns 200 for already saved item (idempotent)', async () => {
      // Save first time
      await request(app)
        .post(`/api/saved-items/${testProduct.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201)

      // Save second time - should be 200 not 201
      const res = await request(app)
        .post(`/api/saved-items/${testProduct.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(res.body._meta.wasExisting).toBe(true)
    })

    it('returns 404 for non-existent product', async () => {
      const res = await request(app)
        .post('/api/saved-items/non-existent-product')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404)

      expect(res.body.error).toBe('Product not found')
    })
  })

  describe('DELETE /api/saved-items/:productId', () => {
    it('removes a saved item', async () => {
      // Save first
      await request(app)
        .post(`/api/saved-items/${testProduct.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201)

      // Delete
      await request(app)
        .delete(`/api/saved-items/${testProduct.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      // Verify it's gone
      const res = await request(app)
        .get('/api/saved-items')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(res.body.items).toHaveLength(0)
    })

    it('returns 404 for non-saved item', async () => {
      const res = await request(app)
        .delete(`/api/saved-items/${testProduct.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404)

      expect(res.body.error).toBe('Item not found')
    })
  })

  describe('PATCH /api/saved-items/:productId', () => {
    beforeEach(async () => {
      // Save item before each PATCH test
      await request(app)
        .post(`/api/saved-items/${testProduct.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201)
    })

    it('updates notification preferences', async () => {
      const res = await request(app)
        .patch(`/api/saved-items/${testProduct.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          notificationsEnabled: false,
          minDropPercent: 10,
        })
        .expect(200)

      expect(res.body.notificationsEnabled).toBe(false)
      expect(res.body.minDropPercent).toBe(10)
    })

    it('validates minDropPercent range', async () => {
      const res = await request(app)
        .patch(`/api/saved-items/${testProduct.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ minDropPercent: 150 })
        .expect(400)

      expect(res.body.error).toContain('Invalid data')
    })

    it('validates stockAlertCooldownHours range', async () => {
      const res = await request(app)
        .patch(`/api/saved-items/${testProduct.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ stockAlertCooldownHours: 200 }) // Max is 168
        .expect(400)

      expect(res.body.error).toContain('Invalid data')
    })
  })

  describe('GET /api/saved-items/:productId', () => {
    it('returns saved status for saved item', async () => {
      await request(app)
        .post(`/api/saved-items/${testProduct.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201)

      const res = await request(app)
        .get(`/api/saved-items/${testProduct.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(res.body.isSaved).toBe(true)
      expect(res.body.productId).toBe(testProduct.id)
    })

    it('returns 404 for non-saved item', async () => {
      const res = await request(app)
        .get(`/api/saved-items/${testProduct.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404)

      expect(res.body.isSaved).toBe(false)
    })
  })

  describe('user isolation', () => {
    it('does not show other users saved items', async () => {
      // User 1 saves item
      await request(app)
        .post(`/api/saved-items/${testProduct.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201)

      // User 2 should not see it
      const user2 = await createTestUser(prisma, { id: 'test-user-2' })
      const token2 = createAuthToken(user2.id)

      const res = await request(app)
        .get('/api/saved-items')
        .set('Authorization', `Bearer ${token2}`)
        .expect(200)

      expect(res.body.items).toHaveLength(0)
    })
  })
})
