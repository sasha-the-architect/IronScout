/**
 * System Settings utilities for runtime configuration
 *
 * These functions provide a way to check system settings from any app
 * (harvester, API, etc.) with env var fallback support.
 */

import { prisma } from './index.js'

// =============================================================================
// Setting Keys (must match admin app constants)
// =============================================================================

export const SETTING_KEYS = {
  // Danger Zone
  ALLOW_PLAIN_FTP: 'AFFILIATE_FEED_ALLOW_PLAIN_FTP',
  HARVESTER_SCHEDULER_ENABLED: 'HARVESTER_SCHEDULER_ENABLED',
  AFFILIATE_SCHEDULER_ENABLED: 'AFFILIATE_FEED_SCHEDULER_ENABLED',

  // Operations
  AFFILIATE_BATCH_SIZE: 'AFFILIATE_BATCH_SIZE',
  PRICE_HEARTBEAT_HOURS: 'PRICE_HEARTBEAT_HOURS',
  AFFILIATE_RUN_RETENTION_DAYS: 'AFFILIATE_RUN_RETENTION_DAYS',
  HARVESTER_LOG_LEVEL: 'HARVESTER_LOG_LEVEL',

  // Queue History Settings
  QUEUE_HISTORY_RETENTION_COUNT: 'QUEUE_HISTORY_RETENTION_COUNT',
  QUEUE_HISTORY_CRAWL: 'QUEUE_HISTORY_CRAWL',
  QUEUE_HISTORY_FETCH: 'QUEUE_HISTORY_FETCH',
  QUEUE_HISTORY_EXTRACT: 'QUEUE_HISTORY_EXTRACT',
  QUEUE_HISTORY_NORMALIZE: 'QUEUE_HISTORY_NORMALIZE',
  QUEUE_HISTORY_WRITE: 'QUEUE_HISTORY_WRITE',
  QUEUE_HISTORY_ALERT: 'QUEUE_HISTORY_ALERT',
  QUEUE_HISTORY_MERCHANT_FEED_INGEST: 'QUEUE_HISTORY_MERCHANT_FEED_INGEST',
  QUEUE_HISTORY_MERCHANT_SKU_MATCH: 'QUEUE_HISTORY_MERCHANT_SKU_MATCH',
  QUEUE_HISTORY_MERCHANT_BENCHMARK: 'QUEUE_HISTORY_MERCHANT_BENCHMARK',
  QUEUE_HISTORY_MERCHANT_INSIGHT: 'QUEUE_HISTORY_MERCHANT_INSIGHT',
  QUEUE_HISTORY_AFFILIATE_FEED: 'QUEUE_HISTORY_AFFILIATE_FEED',
  QUEUE_HISTORY_AFFILIATE_SCHEDULER: 'QUEUE_HISTORY_AFFILIATE_SCHEDULER',

  // Feature Flags
  MAINTENANCE_MODE: 'MAINTENANCE_MODE',
  REGISTRATION_ENABLED: 'REGISTRATION_ENABLED',
  AI_SEARCH_ENABLED: 'AI_SEARCH_ENABLED',
  VECTOR_SEARCH_ENABLED: 'VECTOR_SEARCH_ENABLED',
  EMAIL_NOTIFICATIONS_ENABLED: 'EMAIL_NOTIFICATIONS_ENABLED',
  ALERT_PROCESSING_ENABLED: 'ALERT_PROCESSING_ENABLED',
} as const

export type SettingKey = typeof SETTING_KEYS[keyof typeof SETTING_KEYS]

// =============================================================================
// Default Values
// =============================================================================

const DEFAULTS: Record<SettingKey, boolean | number | string> = {
  // Danger Zone
  [SETTING_KEYS.ALLOW_PLAIN_FTP]: false,
  [SETTING_KEYS.HARVESTER_SCHEDULER_ENABLED]: true,
  [SETTING_KEYS.AFFILIATE_SCHEDULER_ENABLED]: true,

  // Operations
  [SETTING_KEYS.AFFILIATE_BATCH_SIZE]: 1000,
  [SETTING_KEYS.PRICE_HEARTBEAT_HOURS]: 24,
  [SETTING_KEYS.AFFILIATE_RUN_RETENTION_DAYS]: 30,
  [SETTING_KEYS.HARVESTER_LOG_LEVEL]: 'info',

  // Queue History (all enabled by default)
  [SETTING_KEYS.QUEUE_HISTORY_RETENTION_COUNT]: 100,
  [SETTING_KEYS.QUEUE_HISTORY_CRAWL]: true,
  [SETTING_KEYS.QUEUE_HISTORY_FETCH]: true,
  [SETTING_KEYS.QUEUE_HISTORY_EXTRACT]: true,
  [SETTING_KEYS.QUEUE_HISTORY_NORMALIZE]: true,
  [SETTING_KEYS.QUEUE_HISTORY_WRITE]: true,
  [SETTING_KEYS.QUEUE_HISTORY_ALERT]: true,
  [SETTING_KEYS.QUEUE_HISTORY_MERCHANT_FEED_INGEST]: true,
  [SETTING_KEYS.QUEUE_HISTORY_MERCHANT_SKU_MATCH]: true,
  [SETTING_KEYS.QUEUE_HISTORY_MERCHANT_BENCHMARK]: true,
  [SETTING_KEYS.QUEUE_HISTORY_MERCHANT_INSIGHT]: true,
  [SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_FEED]: true,
  [SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_SCHEDULER]: true,

  // Feature Flags
  [SETTING_KEYS.MAINTENANCE_MODE]: false,
  [SETTING_KEYS.REGISTRATION_ENABLED]: true,
  [SETTING_KEYS.AI_SEARCH_ENABLED]: true,
  [SETTING_KEYS.VECTOR_SEARCH_ENABLED]: true,
  [SETTING_KEYS.EMAIL_NOTIFICATIONS_ENABLED]: true,
  [SETTING_KEYS.ALERT_PROCESSING_ENABLED]: true,
}

// =============================================================================
// Cache for settings (refresh every 60 seconds)
// =============================================================================

interface CachedSetting {
  value: boolean | number | string
  timestamp: number
}

const cache = new Map<string, CachedSetting>()
const CACHE_TTL_MS = 60_000 // 1 minute

// =============================================================================
// Public API
// =============================================================================

/**
 * Get a boolean setting value (with env var override)
 */
export async function getBooleanSetting(key: SettingKey): Promise<boolean> {
  // Check env var first (for local override)
  const envValue = process.env[key]
  if (envValue === 'true') return true
  if (envValue === 'false') return false

  return (await getSettingValue(key)) as boolean
}

/**
 * Get a number setting value (with env var override)
 */
export async function getNumberSetting(key: SettingKey): Promise<number> {
  // Check env var first (for local override)
  const envValue = process.env[key]
  if (envValue) {
    const parsed = parseInt(envValue, 10)
    if (!isNaN(parsed)) return parsed
  }

  return (await getSettingValue(key)) as number
}

/**
 * Get a string setting value (with env var override)
 */
export async function getStringSetting(key: SettingKey): Promise<string> {
  // Check env var first (for local override)
  const envValue = process.env[key]
  if (envValue) return envValue

  return (await getSettingValue(key)) as string
}

/**
 * Check if a feature is enabled
 */
export async function isFeatureEnabled(key: SettingKey): Promise<boolean> {
  return getBooleanSetting(key)
}

/**
 * Convenience functions for common checks
 */
export const isPlainFtpAllowed = () => getBooleanSetting(SETTING_KEYS.ALLOW_PLAIN_FTP)
export const isHarvesterSchedulerEnabled = () => getBooleanSetting(SETTING_KEYS.HARVESTER_SCHEDULER_ENABLED)
export const isAffiliateSchedulerEnabled = () => getBooleanSetting(SETTING_KEYS.AFFILIATE_SCHEDULER_ENABLED)
export const isMaintenanceMode = () => getBooleanSetting(SETTING_KEYS.MAINTENANCE_MODE)
export const isRegistrationEnabled = () => getBooleanSetting(SETTING_KEYS.REGISTRATION_ENABLED)
export const isAiSearchEnabled = () => getBooleanSetting(SETTING_KEYS.AI_SEARCH_ENABLED)
export const isVectorSearchEnabled = () => getBooleanSetting(SETTING_KEYS.VECTOR_SEARCH_ENABLED)
export const isEmailNotificationsEnabled = () => getBooleanSetting(SETTING_KEYS.EMAIL_NOTIFICATIONS_ENABLED)
export const isAlertProcessingEnabled = () => getBooleanSetting(SETTING_KEYS.ALERT_PROCESSING_ENABLED)

export const getAffiliateBatchSize = () => getNumberSetting(SETTING_KEYS.AFFILIATE_BATCH_SIZE)
export const getPriceHeartbeatHours = () => getNumberSetting(SETTING_KEYS.PRICE_HEARTBEAT_HOURS)
export const getAffiliateRunRetentionDays = () => getNumberSetting(SETTING_KEYS.AFFILIATE_RUN_RETENTION_DAYS)
export const getHarvesterLogLevel = () => getStringSetting(SETTING_KEYS.HARVESTER_LOG_LEVEL)

/**
 * Queue history settings - maps queue name to setting key
 */
export const QUEUE_HISTORY_SETTING_MAP: Record<string, string> = {
  crawl: SETTING_KEYS.QUEUE_HISTORY_CRAWL,
  fetch: SETTING_KEYS.QUEUE_HISTORY_FETCH,
  extract: SETTING_KEYS.QUEUE_HISTORY_EXTRACT,
  normalize: SETTING_KEYS.QUEUE_HISTORY_NORMALIZE,
  write: SETTING_KEYS.QUEUE_HISTORY_WRITE,
  alert: SETTING_KEYS.QUEUE_HISTORY_ALERT,
  'merchant-feed-ingest': SETTING_KEYS.QUEUE_HISTORY_MERCHANT_FEED_INGEST,
  'merchant-sku-match': SETTING_KEYS.QUEUE_HISTORY_MERCHANT_SKU_MATCH,
  'merchant-benchmark': SETTING_KEYS.QUEUE_HISTORY_MERCHANT_BENCHMARK,
  'merchant-insight': SETTING_KEYS.QUEUE_HISTORY_MERCHANT_INSIGHT,
  'affiliate-feed': SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_FEED,
  'affiliate-feed-scheduler': SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_SCHEDULER,
}

/**
 * Get all queue history settings for harvester initialization
 */
export async function getQueueHistorySettings(): Promise<{
  retentionCount: number
  queues: Record<string, boolean>
}> {
  const retentionCount = await getNumberSetting(SETTING_KEYS.QUEUE_HISTORY_RETENTION_COUNT)

  const queues: Record<string, boolean> = {}
  for (const [queueName, settingKey] of Object.entries(QUEUE_HISTORY_SETTING_MAP)) {
    queues[queueName] = await getBooleanSetting(settingKey as SettingKey)
  }

  return { retentionCount, queues }
}

/**
 * Clear the settings cache (useful after updates)
 */
export function clearSettingsCache(): void {
  cache.clear()
}

// =============================================================================
// Internal
// =============================================================================

async function getSettingValue(key: SettingKey): Promise<boolean | number | string> {
  // Check cache first
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value
  }

  try {
    const setting = await prisma.system_settings.findUnique({
      where: { key },
    })

    const value = setting ? (setting.value as boolean | number | string) : DEFAULTS[key]

    // Update cache
    cache.set(key, { value, timestamp: Date.now() })

    return value
  } catch (error) {
    // On error, return default and don't cache
    console.error(`[SystemSettings] Failed to get setting ${key}, falling back to default`, { error })
    try {
      process.emitWarning?.(
        `[SystemSettings] Fallback used for key ${key}`,
        { type: 'SystemSettingsFallback' }
      )
    } catch {
      // emitWarning may not be available; ignore
    }
    return DEFAULTS[key]
  }
}
