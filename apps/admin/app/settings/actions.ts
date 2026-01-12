'use server';

import { prisma } from '@ironscout/db';
import { revalidatePath } from 'next/cache';
import { getAdminSession, logAdminAction } from '@/lib/auth';
import { loggers } from '@/lib/logger';
import {
  SETTING_KEYS,
  SETTING_DEFAULTS,
  SETTING_DESCRIPTIONS,
  SETTING_TYPES,
  NUMBER_SETTING_RANGES,
  DANGER_ZONE_KEYS,
  QUEUE_HISTORY_KEYS,
  LOG_LEVELS,
  type SettingKey,
  type LogLevel,
} from './constants';

// =============================================================================
// Types
// =============================================================================

export interface SettingValue {
  value: boolean | number | string;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export interface AllSettings {
  dangerZone: {
    allowPlainFtp: SettingValue;
    harvesterSchedulerEnabled: SettingValue;
    affiliateSchedulerEnabled: SettingValue;
    circuitBreakerBypass: SettingValue;
  };
  operations: {
    affiliateBatchSize: SettingValue;
    priceHeartbeatHours: SettingValue;
    affiliateRunRetentionDays: SettingValue;
    harvesterLogLevel: SettingValue;
  };
  queueHistory: {
    retentionCount: SettingValue;
    crawl: SettingValue;
    fetch: SettingValue;
    extract: SettingValue;
    normalize: SettingValue;
    write: SettingValue;
    alert: SettingValue;
    retailerFeedIngest: SettingValue;
    // Note: retailerSkuMatch, retailerBenchmark, retailerInsight removed (benchmark subsystem removed for v1)
    affiliateFeed: SettingValue;
    affiliateScheduler: SettingValue;
  };
  featureFlags: {
    maintenanceMode: SettingValue;
    registrationEnabled: SettingValue;
    aiSearchEnabled: SettingValue;
    vectorSearchEnabled: SettingValue;
    emailNotificationsEnabled: SettingValue;
    alertProcessingEnabled: SettingValue;
    autoEmbeddingEnabled: SettingValue;
  };
}

// =============================================================================
// Read Operations
// =============================================================================

export async function getSystemSetting(key: SettingKey): Promise<SettingValue> {
  const setting = await prisma.system_settings.findUnique({
    where: { key },
  });

  if (!setting) {
    return {
      value: SETTING_DEFAULTS[key],
      updatedAt: null,
      updatedBy: null,
    };
  }

  return {
    value: setting.value as boolean | number | string,
    updatedAt: setting.updatedAt,
    updatedBy: setting.updatedBy,
  };
}

export async function getAllSettings(): Promise<{ success: boolean; error?: string; settings: AllSettings | null }> {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized', settings: null };
  }

  try {
    // Fetch all settings in parallel
    const [
      allowPlainFtp,
      harvesterSchedulerEnabled,
      affiliateSchedulerEnabled,
      circuitBreakerBypass,
      affiliateBatchSize,
      priceHeartbeatHours,
      affiliateRunRetentionDays,
      harvesterLogLevel,
      // Queue history settings
      queueHistoryRetentionCount,
      queueHistoryCrawl,
      queueHistoryFetch,
      queueHistoryExtract,
      queueHistoryNormalize,
      queueHistoryWrite,
      queueHistoryAlert,
      queueHistoryRetailerFeedIngest,
      queueHistoryAffiliateFeed,
      queueHistoryAffiliateScheduler,
      // Feature flags
      maintenanceMode,
      registrationEnabled,
      aiSearchEnabled,
      vectorSearchEnabled,
      emailNotificationsEnabled,
      alertProcessingEnabled,
      autoEmbeddingEnabled,
    ] = await Promise.all([
      getSystemSetting(SETTING_KEYS.ALLOW_PLAIN_FTP),
      getSystemSetting(SETTING_KEYS.HARVESTER_SCHEDULER_ENABLED),
      getSystemSetting(SETTING_KEYS.AFFILIATE_SCHEDULER_ENABLED),
      getSystemSetting(SETTING_KEYS.CIRCUIT_BREAKER_BYPASS),
      getSystemSetting(SETTING_KEYS.AFFILIATE_BATCH_SIZE),
      getSystemSetting(SETTING_KEYS.PRICE_HEARTBEAT_HOURS),
      getSystemSetting(SETTING_KEYS.AFFILIATE_RUN_RETENTION_DAYS),
      getSystemSetting(SETTING_KEYS.HARVESTER_LOG_LEVEL),
      // Queue history settings
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_RETENTION_COUNT),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_CRAWL),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_FETCH),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_EXTRACT),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_NORMALIZE),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_WRITE),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_ALERT),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_RETAILER_FEED_INGEST),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_FEED),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_SCHEDULER),
      // Feature flags
      getSystemSetting(SETTING_KEYS.MAINTENANCE_MODE),
      getSystemSetting(SETTING_KEYS.REGISTRATION_ENABLED),
      getSystemSetting(SETTING_KEYS.AI_SEARCH_ENABLED),
      getSystemSetting(SETTING_KEYS.VECTOR_SEARCH_ENABLED),
      getSystemSetting(SETTING_KEYS.EMAIL_NOTIFICATIONS_ENABLED),
      getSystemSetting(SETTING_KEYS.ALERT_PROCESSING_ENABLED),
      getSystemSetting(SETTING_KEYS.AUTO_EMBEDDING_ENABLED),
    ]);

    return {
      success: true,
      settings: {
        dangerZone: {
          allowPlainFtp,
          harvesterSchedulerEnabled,
          affiliateSchedulerEnabled,
          circuitBreakerBypass,
        },
        operations: {
          affiliateBatchSize,
          priceHeartbeatHours,
          affiliateRunRetentionDays,
          harvesterLogLevel,
        },
        queueHistory: {
          retentionCount: queueHistoryRetentionCount,
          crawl: queueHistoryCrawl,
          fetch: queueHistoryFetch,
          extract: queueHistoryExtract,
          normalize: queueHistoryNormalize,
          write: queueHistoryWrite,
          alert: queueHistoryAlert,
          retailerFeedIngest: queueHistoryRetailerFeedIngest,
          affiliateFeed: queueHistoryAffiliateFeed,
          affiliateScheduler: queueHistoryAffiliateScheduler,
        },
        featureFlags: {
          maintenanceMode,
          registrationEnabled,
          aiSearchEnabled,
          vectorSearchEnabled,
          emailNotificationsEnabled,
          alertProcessingEnabled,
          autoEmbeddingEnabled,
        },
      },
    };
  } catch (error) {
    loggers.settings.error('Failed to get settings', {}, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to load settings', settings: null };
  }
}

// Backwards compatibility
export async function getAllDangerZoneSettings() {
  const result = await getAllSettings();
  if (!result.success || !result.settings) {
    return { success: false, error: result.error, settings: null };
  }
  return {
    success: true,
    settings: {
      allowPlainFtp: result.settings.dangerZone.allowPlainFtp,
    },
  };
}

// =============================================================================
// Write Operations
// =============================================================================

/**
 * Update a danger zone setting (requires double confirmation)
 */
export async function updateDangerZoneSetting(
  key: SettingKey,
  value: boolean,
  confirmationCode: string
) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  // Verify this is actually a danger zone setting
  if (!DANGER_ZONE_KEYS.includes(key as any)) {
    return { success: false, error: 'Not a danger zone setting' };
  }

  // Double confirmation: require exact confirmation code
  const expectedCode = value ? 'ENABLE' : 'DISABLE';
  if (confirmationCode !== expectedCode) {
    return { success: false, error: `Invalid confirmation code. Expected: ${expectedCode}` };
  }

  return updateSetting(key, value, session);
}

/**
 * Update an operations setting (number value)
 */
export async function updateOperationsSetting(
  key: SettingKey,
  value: number
) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  // Validate type
  if (SETTING_TYPES[key] !== 'number') {
    return { success: false, error: 'Invalid setting type' };
  }

  // Validate range
  const range = NUMBER_SETTING_RANGES[key];
  if (range) {
    if (value < range.min || value > range.max) {
      return { success: false, error: `Value must be between ${range.min} and ${range.max}` };
    }
  }

  return updateSetting(key, value, session);
}

/**
 * Update a feature flag setting (boolean value)
 */
export async function updateFeatureFlagSetting(
  key: SettingKey,
  value: boolean
) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  // Validate type
  if (SETTING_TYPES[key] !== 'boolean') {
    return { success: false, error: 'Invalid setting type' };
  }

  return updateSetting(key, value, session);
}

/**
 * Update the harvester log level setting
 */
export async function updateLogLevelSetting(
  value: string
) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  // Validate that it's a valid log level
  if (!LOG_LEVELS.includes(value as LogLevel)) {
    return { success: false, error: `Invalid log level. Must be one of: ${LOG_LEVELS.join(', ')}` };
  }

  return updateSetting(SETTING_KEYS.HARVESTER_LOG_LEVEL, value, session);
}

/**
 * Update a queue history setting (boolean or number value)
 */
export async function updateQueueHistorySetting(
  key: SettingKey,
  value: boolean | number
) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  // Verify this is a queue history setting
  if (!QUEUE_HISTORY_KEYS.includes(key as any)) {
    return { success: false, error: 'Not a queue history setting' };
  }

  // Validate type
  const expectedType = SETTING_TYPES[key];
  if (expectedType === 'number' && typeof value !== 'number') {
    return { success: false, error: 'Expected number value' };
  }
  if (expectedType === 'boolean' && typeof value !== 'boolean') {
    return { success: false, error: 'Expected boolean value' };
  }

  // Validate range for number settings
  if (expectedType === 'number') {
    const range = NUMBER_SETTING_RANGES[key];
    if (range && (value as number < range.min || value as number > range.max)) {
      return { success: false, error: `Value must be between ${range.min} and ${range.max}` };
    }
  }

  return updateSetting(key, value, session);
}

/**
 * Internal helper to update a setting
 */
async function updateSetting(
  key: SettingKey,
  value: boolean | number | string,
  session: { userId: string; email: string }
) {
  try {
    const oldSetting = await prisma.system_settings.findUnique({
      where: { key },
    });

    const oldValue = oldSetting?.value ?? SETTING_DEFAULTS[key];

    await prisma.system_settings.upsert({
      where: { key },
      create: {
        key,
        value,
        description: SETTING_DESCRIPTIONS[key],
        updatedBy: session.email,
      },
      update: {
        value,
        updatedBy: session.email,
      },
    });

    await logAdminAction(session.userId, 'UPDATE_SYSTEM_SETTING', {
      resource: 'SystemSetting',
      resourceId: key,
      oldValue: { value: oldValue },
      newValue: { value },
    });

    revalidatePath('/settings');

    return { success: true };
  } catch (error) {
    loggers.settings.error('Failed to update system setting', { key }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to update setting' };
  }
}

// =============================================================================
// Public API for checking settings from other services
// =============================================================================

/**
 * Check if plain FTP is allowed (for use by validation code)
 */
export async function isPlainFtpAllowed(): Promise<boolean> {
  // Check env var first (for local dev override)
  if (process.env.AFFILIATE_FEED_ALLOW_PLAIN_FTP === 'true') {
    return true;
  }

  const setting = await getSystemSetting(SETTING_KEYS.ALLOW_PLAIN_FTP);
  return setting.value as boolean;
}

/**
 * Check if a feature flag is enabled
 */
export async function isFeatureEnabled(key: SettingKey): Promise<boolean> {
  // Check env var first (for local override)
  const envValue = process.env[key];
  if (envValue === 'true') return true;
  if (envValue === 'false') return false;

  const setting = await getSystemSetting(key);
  return setting.value as boolean;
}

/**
 * Get an operations setting value
 */
export async function getOperationsValue(key: SettingKey): Promise<number> {
  // Check env var first (for local override)
  const envValue = process.env[key];
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed)) return parsed;
  }

  const setting = await getSystemSetting(key);
  return setting.value as number;
}

// =============================================================================
// Data Integrity Checks
// =============================================================================

export interface IntegrityCheckResult {
  name: string;
  description: string;
  status: 'ok' | 'warning' | 'error';
  count: number;
  message: string;
  lastChecked: Date;
}

export interface DataIntegrityResults {
  checks: IntegrityCheckResult[];
  overallStatus: 'ok' | 'warning' | 'error';
  lastChecked: Date;
}

/**
 * Run all data integrity checks
 */
export async function runDataIntegrityChecks(): Promise<{ success: boolean; error?: string; results?: DataIntegrityResults }> {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const checks: IntegrityCheckResult[] = [];
    const now = new Date();

    // NOTE: pricing_snapshots checks removed - table deleted (benchmark subsystem removed for v1)

    // Check 1: Orphaned prices (sourceId points to deleted source)
    const orphanedPrices = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM prices p
      WHERE p."sourceId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM sources s WHERE s.id = p."sourceId"
        )
    `;
    const orphanedPricesCount = Number(orphanedPrices[0]?.count ?? 0);
    checks.push({
      name: 'Orphaned Price Records',
      description: 'Prices with sourceId pointing to non-existent sources',
      status: orphanedPricesCount === 0 ? 'ok' : 'warning',
      count: orphanedPricesCount,
      message: orphanedPricesCount === 0
        ? 'No orphaned price records found'
        : `${orphanedPricesCount} prices reference deleted sources`,
      lastChecked: now,
    });

    // Check 3: Sources without retailer (should not exist per ADR-016)
    const sourcesWithoutRetailer = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM sources s
      WHERE s."retailerId" IS NULL
    `;
    const sourcesWithoutRetailerCount = Number(sourcesWithoutRetailer[0]?.count ?? 0);
    checks.push({
      name: 'Sources Without Retailer',
      description: 'Sources must have a retailerId (required field)',
      status: sourcesWithoutRetailerCount === 0 ? 'ok' : 'error',
      count: sourcesWithoutRetailerCount,
      message: sourcesWithoutRetailerCount === 0
        ? 'All sources have valid retailer associations'
        : `${sourcesWithoutRetailerCount} sources missing retailerId (data integrity violation)`,
      lastChecked: now,
    });

    // Check 4: Alerts with suppressed but still enabled
    const suppressedEnabledAlerts = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM alerts a
      WHERE a."suppressedAt" IS NOT NULL
        AND a."isEnabled" = true
    `;
    const suppressedEnabledCount = Number(suppressedEnabledAlerts[0]?.count ?? 0);
    checks.push({
      name: 'Suppressed But Enabled Alerts',
      description: 'Suppressed alerts should typically be disabled',
      status: suppressedEnabledCount === 0 ? 'ok' : 'warning',
      count: suppressedEnabledCount,
      message: suppressedEnabledCount === 0
        ? 'No conflicting alert states found'
        : `${suppressedEnabledCount} alerts are both suppressed and enabled`,
      lastChecked: now,
    });

    // Check 5: Recent prices missing provenance (ADR-015 requirement)
    // New writes MUST include ingestionRunType and ingestionRunId
    const recentPricesWithoutProvenance = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM prices p
      WHERE p."createdAt" > NOW() - INTERVAL '24 hours'
        AND (p."ingestionRunType" IS NULL OR p."ingestionRunId" IS NULL)
    `;
    const pricesWithoutProvenanceCount = Number(recentPricesWithoutProvenance[0]?.count ?? 0);
    checks.push({
      name: 'Recent Prices Without Provenance',
      description: 'ADR-015: New prices must include ingestionRunType and ingestionRunId',
      status: pricesWithoutProvenanceCount === 0 ? 'ok' : 'warning',
      count: pricesWithoutProvenanceCount,
      message: pricesWithoutProvenanceCount === 0
        ? 'All recent prices have provenance fields'
        : `${pricesWithoutProvenanceCount} prices in last 24h missing provenance`,
      lastChecked: now,
    });

    // NOTE: pricing_snapshots provenance check removed - table deleted (benchmark subsystem removed for v1)

    // Determine overall status
    let overallStatus: 'ok' | 'warning' | 'error' = 'ok';
    for (const check of checks) {
      if (check.status === 'error') {
        overallStatus = 'error';
        break;
      }
      if (check.status === 'warning') {
        overallStatus = 'warning';
      }
    }

    await logAdminAction(session.userId, 'RUN_DATA_INTEGRITY_CHECKS', {
      resource: 'DataIntegrity',
      newValue: { checksRun: checks.length, overallStatus },
    });

    return {
      success: true,
      results: {
        checks,
        overallStatus,
        lastChecked: now,
      },
    };
  } catch (error) {
    loggers.settings.error('Failed to run data integrity checks', {}, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to run integrity checks' };
  }
}
