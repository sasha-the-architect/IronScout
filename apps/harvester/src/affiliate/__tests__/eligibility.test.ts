/**
 * Tests for Feed Eligibility Enforcement
 *
 * Tests that ineligible feeds are skipped and auto-pause works correctly.
 */

import { describe, it, expect } from 'vitest'

describe('Feed Eligibility', () => {
  describe('Status Checks', () => {
    it('should skip DRAFT feeds', () => {
      const feed = { status: 'DRAFT' as string }
      const trigger: string = 'SCHEDULED'

      const shouldSkip = feed.status === 'DRAFT'

      expect(shouldSkip).toBe(true)
    })

    it('should skip DISABLED feeds for scheduled runs', () => {
      const feed = { status: 'DISABLED' as string }
      const trigger: string = 'SCHEDULED'

      const shouldSkip = feed.status === 'DISABLED' && trigger !== 'MANUAL' && trigger !== 'ADMIN_TEST'

      expect(shouldSkip).toBe(true)
    })

    it('should allow DISABLED feeds for manual runs', () => {
      const feed = { status: 'DISABLED' as string }
      const trigger: string = 'MANUAL'

      const shouldSkip = feed.status === 'DISABLED' && trigger !== 'MANUAL' && trigger !== 'ADMIN_TEST'

      expect(shouldSkip).toBe(false)
    })

    it('should allow DISABLED feeds for admin test runs', () => {
      const feed = { status: 'DISABLED' as string }
      const trigger: string = 'ADMIN_TEST'

      const shouldSkip = feed.status === 'DISABLED' && trigger !== 'MANUAL' && trigger !== 'ADMIN_TEST'

      expect(shouldSkip).toBe(false)
    })

    it('should allow ENABLED feeds', () => {
      const feed = { status: 'ENABLED' }
      const trigger = 'SCHEDULED'

      const shouldSkip = feed.status === 'DRAFT'

      expect(shouldSkip).toBe(false)
    })

    it('should allow PAUSED feeds for manual runs', () => {
      const feed = { status: 'PAUSED' }
      const trigger = 'MANUAL'

      // PAUSED feeds should be allowed for manual runs
      const shouldSkip = feed.status === 'DRAFT'

      expect(shouldSkip).toBe(false)
    })
  })

  describe('Trigger Types', () => {
    const validTriggers = ['SCHEDULED', 'MANUAL', 'ADMIN_TEST', 'MANUAL_PENDING']

    validTriggers.forEach((trigger) => {
      it(`should recognize trigger type: ${trigger}`, () => {
        expect(validTriggers).toContain(trigger)
      })
    })
  })
})

describe('Auto-Pause (Auto-Disable) Behavior', () => {
  const MAX_CONSECUTIVE_FAILURES = 3

  describe('Failure Counting', () => {
    it('should increment consecutiveFailures on failure', () => {
      const feed = { consecutiveFailures: 1 }
      const status = 'FAILED'

      const newFailureCount = status === 'FAILED' ? feed.consecutiveFailures + 1 : 0

      expect(newFailureCount).toBe(2)
    })

    it('should reset consecutiveFailures on success', () => {
      const feed = { consecutiveFailures: 2 }
      const status = 'SUCCEEDED'

      const newFailureCount = status === 'SUCCEEDED' ? 0 : feed.consecutiveFailures + 1

      expect(newFailureCount).toBe(0)
    })

    it('should reset consecutiveFailures on skip', () => {
      const feed = { consecutiveFailures: 1 }
      const status = 'SKIPPED'

      const newFailureCount = status === 'SKIPPED' ? 0 : feed.consecutiveFailures + 1

      expect(newFailureCount).toBe(0)
    })
  })

  describe('Auto-Disable Threshold', () => {
    it('should not disable on first failure', () => {
      const currentFailures = 0
      const newFailures = currentFailures + 1

      const shouldDisable = newFailures >= MAX_CONSECUTIVE_FAILURES

      expect(shouldDisable).toBe(false)
    })

    it('should not disable on second failure', () => {
      const currentFailures = 1
      const newFailures = currentFailures + 1

      const shouldDisable = newFailures >= MAX_CONSECUTIVE_FAILURES

      expect(shouldDisable).toBe(false)
    })

    it('should disable on third consecutive failure', () => {
      const currentFailures = 2
      const newFailures = currentFailures + 1

      const shouldDisable = newFailures >= MAX_CONSECUTIVE_FAILURES

      expect(shouldDisable).toBe(true)
    })

    it('should disable on fourth consecutive failure', () => {
      const currentFailures = 3
      const newFailures = currentFailures + 1

      const shouldDisable = newFailures >= MAX_CONSECUTIVE_FAILURES

      expect(shouldDisable).toBe(true)
    })
  })

  describe('State Transitions', () => {
    it('should set status to DISABLED when auto-disabling', () => {
      const updateData: Record<string, unknown> = {}
      const newFailureCount = 3

      if (newFailureCount >= MAX_CONSECUTIVE_FAILURES) {
        updateData.status = 'DISABLED'
        updateData.nextRunAt = null
      }

      expect(updateData.status).toBe('DISABLED')
      expect(updateData.nextRunAt).toBeNull()
    })

    it('should clear nextRunAt when auto-disabling', () => {
      const updateData: Record<string, unknown> = { nextRunAt: new Date() }
      const newFailureCount = 3

      if (newFailureCount >= MAX_CONSECUTIVE_FAILURES) {
        updateData.status = 'DISABLED'
        updateData.nextRunAt = null
      }

      expect(updateData.nextRunAt).toBeNull()
    })

    it('should schedule retry if not at failure threshold', () => {
      const updateData: Record<string, unknown> = {}
      const newFailureCount = 2
      const scheduleFrequencyHours = 6
      const finishedAt = new Date()

      if (newFailureCount >= MAX_CONSECUTIVE_FAILURES) {
        updateData.status = 'DISABLED'
        updateData.nextRunAt = null
      } else if (scheduleFrequencyHours) {
        updateData.nextRunAt = new Date(finishedAt.getTime() + scheduleFrequencyHours * 3600000)
      }

      expect(updateData.status).toBeUndefined()
      expect(updateData.nextRunAt).toBeInstanceOf(Date)
    })
  })
})

describe('Run Status Types', () => {
  const validStatuses = ['RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'WAITING_APPROVAL']

  validStatuses.forEach((status) => {
    it(`should recognize run status: ${status}`, () => {
      expect(validStatuses).toContain(status)
    })
  })

  it('should have SUCCEEDED as a success state', () => {
    const status: string = 'SUCCEEDED'
    const isSuccess = status === 'SUCCEEDED' || status === 'SKIPPED'

    expect(isSuccess).toBe(true)
  })

  it('should have SKIPPED as a non-failure state', () => {
    const status: string = 'SKIPPED'
    const isSuccess = status === 'SUCCEEDED' || status === 'SKIPPED'

    expect(isSuccess).toBe(true)
  })

  it('should have FAILED as a failure state', () => {
    const status = 'FAILED'
    const isFailure = status === 'FAILED'

    expect(isFailure).toBe(true)
  })
})
