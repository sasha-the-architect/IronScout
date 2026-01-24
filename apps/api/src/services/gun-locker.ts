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
  '.38 Special',
  '.357 Magnum',
  '.25 ACP',
  '.32 ACP',
  '10mm Auto',
  '.45 ACP',
  '.45 Colt',
  '.40 S&W',
  '.380 ACP',
  '.22 LR',
  '.22 WMR',
  '.17 HMR',
  '.223/5.56',
  '.308/7.62x51',
  '.30-06',
  '.300 AAC Blackout',
  '6.5 Creedmoor',
  '7.62x39',
  '.243 Winchester',
  '.270 Winchester',
  '.30-30 Winchester',
  '12ga',
  '20ga',
  '16ga',
  '.410 Bore',
  'Other',
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
  // .38 Special aliases
  '.38 spl': '.38 Special',
  '38 spl': '.38 Special',
  '38 special': '.38 Special',
  // .357 Magnum aliases
  '.357 mag': '.357 Magnum',
  '357 mag': '.357 Magnum',
  '357 magnum': '.357 Magnum',
  // .25 ACP aliases
  '25 acp': '.25 ACP',
  '.25acp': '.25 ACP',
  // .32 ACP aliases
  '32 acp': '.32 ACP',
  '.32acp': '.32 ACP',
  // 10mm Auto aliases
  '10mm': '10mm Auto',
  '10mm auto': '10mm Auto',
  // .223/5.56 aliases
  '5.56 nato': '.223/5.56',
  '5.56x45mm': '.223/5.56',
  '5.56x45': '.223/5.56',
  '5.56x45 nato': '.223/5.56',
  '5.56x45mm nato': '.223/5.56',
  '5.56mm': '.223/5.56',
  '5.56': '.223/5.56',
  '.223 rem': '.223/5.56',
  '.223 remington': '.223/5.56',
  '223 rem': '.223/5.56',
  '223 remington': '.223/5.56',
  // .308/7.62x51 aliases
  '7.62x51mm': '.308/7.62x51',
  '7.62x51': '.308/7.62x51',
  '7.62 nato': '.308/7.62x51',
  '7.62x51 nato': '.308/7.62x51',
  '7.62x51mm nato': '.308/7.62x51',
  '.308 win': '.308/7.62x51',
  '.308 winchester': '.308/7.62x51',
  '308 win': '.308/7.62x51',
  // .45 ACP aliases
  '.45 auto': '.45 ACP',
  '45 acp': '.45 ACP',
  '.45acp': '.45 ACP',
  // .45 Colt aliases
  '45 colt': '.45 Colt',
  '.45 colt': '.45 Colt',
  '45 long colt': '.45 Colt',
  '.45 long colt': '.45 Colt',
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
  // .22 WMR aliases
  '22 wmr': '.22 WMR',
  '.22 wmr': '.22 WMR',
  '22 mag': '.22 WMR',
  '.22 mag': '.22 WMR',
  '22 magnum': '.22 WMR',
  '.22 magnum': '.22 WMR',
  // .17 HMR aliases
  '17 hmr': '.17 HMR',
  '.17 hmr': '.17 HMR',
  // 6.5 Creedmoor aliases
  '6.5mm creedmoor': '6.5 Creedmoor',
  '6.5 cm': '6.5 Creedmoor',
  // 7.62x39 aliases
  '7.62x39mm': '7.62x39',
  // .30-06 aliases
  '30-06': '.30-06',
  '.30-06 springfield': '.30-06',
  '.30-06 sprg': '.30-06',
  // .300 AAC Blackout aliases
  '300 blackout': '.300 AAC Blackout',
  '.300 blackout': '.300 AAC Blackout',
  '300 aac': '.300 AAC Blackout',
  '.300 aac': '.300 AAC Blackout',
  '300 aac blackout': '.300 AAC Blackout',
  // .243 Winchester aliases
  '.243 win': '.243 Winchester',
  '243 win': '.243 Winchester',
  '243 winchester': '.243 Winchester',
  // .270 Winchester aliases
  '.270 win': '.270 Winchester',
  '270 win': '.270 Winchester',
  '270 winchester': '.270 Winchester',
  // .30-30 Winchester aliases
  '30-30': '.30-30 Winchester',
  '.30-30': '.30-30 Winchester',
  '30-30 win': '.30-30 Winchester',
  '.30-30 win': '.30-30 Winchester',
  '.30-30 winchester': '.30-30 Winchester',
  // Shotgun aliases
  '12 gauge': '12ga',
  '12 ga': '12ga',
  '12g': '12ga',
  '20 gauge': '20ga',
  '20 ga': '20ga',
  '20g': '20ga',
  '16 gauge': '16ga',
  '16 ga': '16ga',
  '16g': '16ga',
  '.410 bore': '.410 Bore',
  '410 bore': '.410 Bore',
  '410': '.410 Bore',
  // Other/unknown
  'other': 'Other',
  'unknown': 'Other',
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
 * Per spec: Guns with unmapped calibers are EXCLUDED from output (data integrity)
 */
export async function getGuns(userId: string): Promise<Gun[]> {
  const guns = await prisma.user_guns.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  // Filter and normalize - EXCLUDE guns with unmapped calibers
  // This ensures output always uses canonical enum values per spec
  return guns
    .map((g) => {
      const caliber = normalizeCaliber(g.caliber)
      if (!caliber) {
        // Log warning for data quality monitoring, but don't expose non-canonical data
        console.warn('[GunLocker] Excluding gun with unmapped caliber', {
          gunId: g.id,
          rawCaliber: g.caliber,
        })
        return null
      }
      return {
        id: g.id,
        caliber,
        nickname: g.nickname,
        createdAt: g.createdAt,
      }
    })
    .filter((g): g is Gun => g !== null)
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
 * Per spec: Unmapped calibers are EXCLUDED from output
 */
export async function getUserCalibers(userId: string): Promise<CaliberValue[]> {
  const guns = await prisma.user_guns.findMany({
    where: { userId },
    select: { caliber: true },
    distinct: ['caliber'],
  })

  // Normalize and filter - EXCLUDE unmapped calibers
  // This ensures output always uses canonical enum values per spec
  const calibers = guns
    .map((g) => normalizeCaliber(g.caliber))
    .filter((c): c is CaliberValue => c !== null)
    .filter((c, i, arr) => arr.indexOf(c) === i) // Dedupe after normalization
  return calibers
}
