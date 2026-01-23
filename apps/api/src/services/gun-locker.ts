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
  '.45 ACP',
  '.40 S&W',
  '.380 ACP',
  '.22 LR',
  '.223/5.56',
  '.308/7.62x51',
  '.30-06',
  '6.5 Creedmoor',
  '7.62x39',
  '12ga',
  '20ga',
] as const

export type CaliberValue = typeof CANONICAL_CALIBERS[number]

/**
 * Alias mapping per gun_locker_v1_spec.md
 * Maps common aliases to canonical values
 */
const CALIBER_ALIASES: Record<string, CaliberValue> = {
  // 9mm aliases
  '9x19mm': '9mm',
  '9x19': '9mm',
  '9mm luger': '9mm',
  '9mm parabellum': '9mm',
  // .223/5.56 aliases
  '5.56 nato': '.223/5.56',
  '5.56x45mm': '.223/5.56',
  '5.56x45': '.223/5.56',
  '5.56mm': '.223/5.56',
  '5.56': '.223/5.56',
  '.223 rem': '.223/5.56',
  '.223 remington': '.223/5.56',
  '223 rem': '.223/5.56',
  // .308/7.62x51 aliases
  '7.62x51mm': '.308/7.62x51',
  '7.62x51': '.308/7.62x51',
  '7.62 nato': '.308/7.62x51',
  '.308 win': '.308/7.62x51',
  '.308 winchester': '.308/7.62x51',
  '308 win': '.308/7.62x51',
  // .45 ACP aliases
  '.45 auto': '.45 ACP',
  '45 acp': '.45 ACP',
  '.45acp': '.45 ACP',
  // .40 S&W aliases
  '40 s&w': '.40 S&W',
  '.40sw': '.40 S&W',
  '.40 smith & wesson': '.40 S&W',
  // .380 ACP aliases
  '380 acp': '.380 ACP',
  '.380acp': '.380 ACP',
  '.380 auto': '.380 ACP',
  // .22 LR aliases
  '22 lr': '.22 LR',
  '.22lr': '.22 LR',
  '22lr': '.22 LR',
  '.22 long rifle': '.22 LR',
  // 6.5 Creedmoor aliases
  '6.5mm creedmoor': '6.5 Creedmoor',
  '6.5 cm': '6.5 Creedmoor',
  // 7.62x39 aliases
  '7.62x39mm': '7.62x39',
  // .30-06 aliases
  '30-06': '.30-06',
  '.30-06 springfield': '.30-06',
  '.30-06 sprg': '.30-06',
  // Shotgun aliases
  '12 gauge': '12ga',
  '12 ga': '12ga',
  '12g': '12ga',
  '20 gauge': '20ga',
  '20 ga': '20ga',
  '20g': '20ga',
}

/**
 * Normalize a caliber input to canonical value
 * Returns the canonical value if valid, null if unmapped
 */
export function normalizeCaliber(input: string): CaliberValue | null {
  const normalized = input.trim()

  // Check direct match (case-insensitive for canonical)
  for (const canonical of CANONICAL_CALIBERS) {
    if (canonical.toLowerCase() === normalized.toLowerCase()) {
      return canonical
    }
  }

  // Check alias mapping (case-insensitive)
  const alias = CALIBER_ALIASES[normalized.toLowerCase()]
  if (alias) {
    return alias
  }

  return null
}

/**
 * Validate that a caliber value is in the canonical enum or can be normalized
 */
export function isValidCaliber(caliber: string): boolean {
  return normalizeCaliber(caliber) !== null
}

export interface Gun {
  id: string
  caliber: CaliberValue
  nickname: string | null
  createdAt: Date
}

/**
 * Get all guns in user's Gun Locker
 * Per spec: Output MUST use canonical caliber enum values
 */
export async function getGuns(userId: string): Promise<Gun[]> {
  const guns = await prisma.user_guns.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  return guns.map((g) => {
    // Runtime normalize to ensure canonical output (handles legacy data)
    const caliber = normalizeCaliber(g.caliber) || (g.caliber as CaliberValue)
    return {
      id: g.id,
      caliber,
      nickname: g.nickname,
      createdAt: g.createdAt,
    }
  })
}

/**
 * Add a gun to user's Gun Locker
 * Normalizes caliber aliases to canonical values per spec
 * @throws Error if caliber cannot be normalized to canonical enum
 */
export async function addGun(
  userId: string,
  caliber: string,
  nickname?: string | null
): Promise<Gun> {
  // Normalize caliber input to canonical value (handles aliases)
  const normalizedCaliber = normalizeCaliber(caliber)
  if (!normalizedCaliber) {
    throw new Error(`Invalid caliber: ${caliber}. Must be one of: ${CANONICAL_CALIBERS.join(', ')}`)
  }

  const gun = await prisma.user_guns.create({
    data: {
      id: randomUUID(),
      userId,
      caliber: normalizedCaliber, // Store canonical value
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
 * Per spec: Output MUST use canonical caliber enum values
 */
export async function getUserCalibers(userId: string): Promise<CaliberValue[]> {
  const guns = await prisma.user_guns.findMany({
    where: { userId },
    select: { caliber: true },
    distinct: ['caliber'],
  })

  // Runtime normalize to ensure canonical output (handles legacy data)
  const calibers = guns
    .map((g) => normalizeCaliber(g.caliber) || (g.caliber as CaliberValue))
    .filter((c, i, arr) => arr.indexOf(c) === i) // Dedupe after normalization
  return calibers
}
