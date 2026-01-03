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
}

// =============================================================================
// Default Values
// =============================================================================

const DEFAULTS = {
  // Danger Zone
  [SETTING_KEYS.ALLOW_PLAIN_FTP]: false,
  [SETTING_KEYS.HARVESTER_SCHEDULER_ENABLED]: true,
  [SETTING_KEYS.AFFILIATE_SCHEDULER_ENABLED]: true,

  // Operations
  [SETTING_KEYS.AFFILIATE_BATCH_SIZE]: 1000,
  [SETTING_KEYS.PRICE_HEARTBEAT_HOURS]: 24,
  [SETTING_KEYS.AFFILIATE_RUN_RETENTION_DAYS]: 30,

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

const cache = new Map()
const CACHE_TTL_MS = 60_000 // 1 minute

// =============================================================================
// Public API
// =============================================================================

/**
 * Get a boolean setting value (with env var override)
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function getBooleanSetting(key) {
  // Check env var first (for local override)
  const envValue = process.env[key]
  if (envValue === 'true') return true
  if (envValue === 'false') return false

  return /** @type {boolean} */ (await getSettingValue(key))
}

/**
 * Get a number setting value (with env var override)
 * @param {string} key
 * @returns {Promise<number>}
 */
export async function getNumberSetting(key) {
  // Check env var first (for local override)
  const envValue = process.env[key]
  if (envValue) {
    const parsed = parseInt(envValue, 10)
    if (!isNaN(parsed)) return parsed
  }

  return /** @type {number} */ (await getSettingValue(key))
}

/**
 * Check if a feature is enabled
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function isFeatureEnabled(key) {
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

/**
 * Queue history settings - maps queue name to setting key
 */
export const QUEUE_HISTORY_SETTING_MAP = {
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
 * @returns {Promise<{ retentionCount: number, queues: Record<string, boolean> }>}
 */
export async function getQueueHistorySettings() {
  const retentionCount = await getNumberSetting(SETTING_KEYS.QUEUE_HISTORY_RETENTION_COUNT)

  const queues = {}
  for (const [queueName, settingKey] of Object.entries(QUEUE_HISTORY_SETTING_MAP)) {
    queues[queueName] = await getBooleanSetting(settingKey)
  }

  return { retentionCount, queues }
}

/**
 * Clear the settings cache (useful after updates)
 */
export function clearSettingsCache() {
  cache.clear()
}

// =============================================================================
// Internal
// =============================================================================

/**
 * @param {string} key
 * @returns {Promise<boolean | number>}
 */
async function getSettingValue(key) {
  // Check cache first
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value
  }

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key },
    })

    const value = setting ? setting.value : DEFAULTS[key]

    // Update cache
    cache.set(key, { value, timestamp: Date.now() })

    return value
  } catch (error) {
    // On error, return default and don't cache
    console.error(`[SystemSettings] Failed to get setting ${key}:`, error)
    return DEFAULTS[key]
  }
}
