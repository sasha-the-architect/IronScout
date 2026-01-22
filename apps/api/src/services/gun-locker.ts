/**
 * Gun Locker Service
 *
 * Manages guns in user's Gun Locker for deal personalization.
 * Per gun_locker_v1_spec.md - calibers must be from the canonical enum.
 */

import { prisma } from '@ironscout/db'
import { randomUUID } from 'crypto'

/**
 * Canonical caliber values per gun_locker_v1_spec.md
 * These are the only valid caliber values that can be stored.
 */
export const CANONICAL_CALIBERS = [
  '9mm',
  '.45_acp',
  '.40_sw',
  '.380_acp',
  '.22_lr',
  '.223_556',
  '.308_762x51',
  '.30-06',
  '6.5_creedmoor',
  '7.62x39',
  '12ga',
  '20ga',
] as const

export type CaliberValue = typeof CANONICAL_CALIBERS[number]

/**
 * Validate that a caliber value is in the canonical enum
 */
export function isValidCaliber(caliber: string): caliber is CaliberValue {
  return CANONICAL_CALIBERS.includes(caliber as CaliberValue)
}

export interface Gun {
  id: string
  caliber: CaliberValue
  nickname: string | null
  createdAt: Date
}

/**
 * Get all guns in user's Gun Locker
 */
export async function getGuns(userId: string): Promise<Gun[]> {
  const guns = await prisma.user_guns.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  return guns.map((g) => ({
    id: g.id,
    caliber: g.caliber as CaliberValue,
    nickname: g.nickname,
    createdAt: g.createdAt,
  }))
}

/**
 * Add a gun to user's Gun Locker
 * @throws Error if caliber is not in canonical enum
 */
export async function addGun(
  userId: string,
  caliber: string,
  nickname?: string | null
): Promise<Gun> {
  // Validate caliber is in canonical enum per spec
  if (!isValidCaliber(caliber)) {
    throw new Error(`Invalid caliber: ${caliber}. Must be one of: ${CANONICAL_CALIBERS.join(', ')}`)
  }

  const gun = await prisma.user_guns.create({
    data: {
      id: randomUUID(),
      userId,
      caliber,
      nickname: nickname || null,
    },
  })

  return {
    id: gun.id,
    caliber: gun.caliber as CaliberValue,
    nickname: gun.nickname,
    createdAt: gun.createdAt,
  }
}

/**
 * Remove a gun from user's Gun Locker
 * @throws Error if gun not found or doesn't belong to user
 */
export async function removeGun(userId: string, gunId: string): Promise<void> {
  const gun = await prisma.user_guns.findUnique({
    where: { id: gunId },
  })

  if (!gun) {
    throw new Error('Gun not found')
  }

  if (gun.userId !== userId) {
    throw new Error('Gun not found') // Don't leak that it exists for another user
  }

  await prisma.user_guns.delete({
    where: { id: gunId },
  })
}

/**
 * Get count of guns in user's Gun Locker
 */
export async function countGuns(userId: string): Promise<number> {
  return prisma.user_guns.count({
    where: { userId },
  })
}

/**
 * Get user's calibers (unique list) for deal personalization
 */
export async function getUserCalibers(userId: string): Promise<CaliberValue[]> {
  const guns = await prisma.user_guns.findMany({
    where: { userId },
    select: { caliber: true },
    distinct: ['caliber'],
  })

  return guns.map((g) => g.caliber as CaliberValue)
}
