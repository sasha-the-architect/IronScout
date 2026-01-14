/**
 * Package Export Smoke Tests
 *
 * Verifies that all package exports resolve correctly.
 * Catches ESM resolution issues (like missing "default" condition)
 * that only surface at runtime with specific Node.js versions.
 *
 * Note: The main export creates a Prisma client and requires DATABASE_URL.
 * Tests that need DATABASE_URL are skipped if it's not available.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { resolve } from 'path'

const DATABASE_URL = process.env.DATABASE_URL

describe('@ironscout/db exports', () => {
  // Main export requires DATABASE_URL since it creates a client singleton
  const itWithDb = DATABASE_URL ? it : it.skip

  itWithDb('main export resolves with DATABASE_URL', async () => {
    const mod = await import('@ironscout/db')
    expect(mod).toHaveProperty('prisma')
  })

  it('main export file exists', () => {
    // Verify the export file exists even if we can't import it
    const indexPath = resolve(__dirname, '../index.js')
    expect(existsSync(indexPath)).toBe(true)
  })

  it('generated prisma export resolves', async () => {
    const mod = await import('@ironscout/db/generated/prisma')

    // Should export Prisma namespace and PrismaClient class
    expect(mod).toHaveProperty('Prisma')
    expect(mod).toHaveProperty('PrismaClient')
  })

  it('test-utils export resolves', async () => {
    const mod = await import('@ironscout/db/test-utils')
    expect(mod).toBeDefined()
  })

  it('visibility export resolves', async () => {
    const mod = await import('@ironscout/db/visibility.js')
    expect(mod).toBeDefined()
  })

  it('package.json exports are correctly configured', async () => {
    const pkgPath = resolve(__dirname, '../package.json')
    const pkg = await import(pkgPath, { with: { type: 'json' } })
    const exports = pkg.default.exports

    // Verify all exports have required conditions
    expect(exports['.']).toHaveProperty('types')
    expect(exports['.']).toHaveProperty('import')
    expect(exports['.']).toHaveProperty('default')

    expect(exports['./generated/prisma']).toHaveProperty('types')
    expect(exports['./generated/prisma']).toHaveProperty('import')
    expect(exports['./generated/prisma']).toHaveProperty('default')

    expect(exports['./test-utils']).toHaveProperty('types')
    expect(exports['./test-utils']).toHaveProperty('import')
    expect(exports['./test-utils']).toHaveProperty('default')
  })
})
