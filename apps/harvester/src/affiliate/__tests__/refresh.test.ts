/**
 * Tests for refresh helpers used when affiliate feeds are unchanged.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { copySeenFromPreviousRun } from '../circuit-breaker'

vi.mock('@ironscout/db', () => ({
  prisma: {
    $executeRaw: vi.fn(),
  },
}))

vi.mock('../../config/logger', () => ({
  logger: {
    affiliate: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}))

describe('copySeenFromPreviousRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('copies seen rows and refreshes presence timestamps', async () => {
    const { prisma } = await import('@ironscout/db')
    vi.mocked(prisma.$executeRaw).mockResolvedValueOnce(42).mockResolvedValueOnce(42)

    const t0 = new Date('2026-01-01T00:00:00.000Z')
    const count = await copySeenFromPreviousRun('run-prev', 'run-current', t0)

    expect(count).toBe(42)
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2)
  })
})
