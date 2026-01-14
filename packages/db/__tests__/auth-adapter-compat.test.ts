/**
 * Auth Adapter Schema Compatibility Tests
 *
 * Verifies that the Prisma schema is compatible with @auth/prisma-adapter.
 * The adapter expects specific relation names (e.g., 'user' not 'users').
 *
 * These tests catch schema mismatches that would only surface at runtime
 * during OAuth callback flows.
 *
 * Requires: DATABASE_URL to be set and accessible
 * Skip: Tests are skipped if no database connection is available
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../generated/prisma'

const DATABASE_URL = process.env.DATABASE_URL

// Skip all tests if no database URL
const describeWithDb = DATABASE_URL ? describe : describe.skip

describeWithDb('Auth adapter schema compatibility', () => {
  let prisma: PrismaClient

  beforeAll(async () => {
    prisma = new PrismaClient()
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it('Account model has "user" relation (not "users")', async () => {
    // This query pattern is what @auth/prisma-adapter uses internally
    // It will throw "Unknown field `user`" if the relation is named wrong
    try {
      await prisma.account.findFirst({
        where: {
          provider: '__test_nonexistent__',
          providerAccountId: '__test_nonexistent__',
        },
        include: {
          user: true,
        },
      })
      // Query succeeded (no results, but that's fine)
      expect(true).toBe(true)
    } catch (error: unknown) {
      // If we get here with "Unknown field", the schema is wrong
      if (error instanceof Error && error.message.includes('Unknown field')) {
        throw new Error(
          'Account model has incorrect relation name. ' +
            '@auth/prisma-adapter expects "user" but schema likely has "users". ' +
            'Update schema.prisma: change "users users @relation..." to "user users @relation..."'
        )
      }
      throw error
    }
  })

  it('Session model has "user" relation (not "users")', async () => {
    try {
      await prisma.session.findFirst({
        where: {
          sessionToken: '__test_nonexistent__',
        },
        include: {
          user: true,
        },
      })
      expect(true).toBe(true)
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('Unknown field')) {
        throw new Error(
          'Session model has incorrect relation name. ' +
            '@auth/prisma-adapter expects "user" but schema likely has "users". ' +
            'Update schema.prisma: change "users users @relation..." to "user users @relation..."'
        )
      }
      throw error
    }
  })

  it('Account has required fields for OAuth', async () => {
    // Use Prisma DMMF to introspect the schema
    // This verifies the schema has all required fields without hitting the DB
    const dmmf = (
      prisma as unknown as {
        _runtimeDataModel: {
          models: Record<string, { fields: Array<{ name: string }> }>
        }
      }
    )._runtimeDataModel

    const accountModel = dmmf.models.Account

    expect(accountModel).toBeDefined()

    const requiredFields = [
      'id',
      'userId',
      'type',
      'provider',
      'providerAccountId',
      'refresh_token',
      'access_token',
      'expires_at',
      'token_type',
      'scope',
      'id_token',
      'session_state',
    ]

    const fieldNames = accountModel.fields.map((f: { name: string }) => f.name)
    for (const field of requiredFields) {
      expect(fieldNames, `Account model missing field: ${field}`).toContain(
        field
      )
    }
  })
})
