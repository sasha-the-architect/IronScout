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
  type SettingKey,
} from './constants';

// =============================================================================
// Types
// =============================================================================

export interface SettingValue {
  value: boolean | number;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export interface AllSettings {
  dangerZone: {
    allowPlainFtp: SettingValue;
    harvesterSchedulerEnabled: SettingValue;
    affiliateSchedulerEnabled: SettingValue;
  };
  operations: {
    affiliateBatchSize: SettingValue;
    priceHeartbeatHours: SettingValue;
    affiliateRunRetentionDays: SettingValue;
  };
  queueHistory: {
    retentionCount: SettingValue;
    crawl: SettingValue;
    fetch: SettingValue;
    extract: SettingValue;
    normalize: SettingValue;
    write: SettingValue;
    alert: SettingValue;
    dealerFeedIngest: SettingValue;
    dealerSkuMatch: SettingValue;
    dealerBenchmark: SettingValue;
    dealerInsight: SettingValue;
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
  };
}

// =============================================================================
// Read Operations
// =============================================================================

export async function getSystemSetting(key: SettingKey): Promise<SettingValue> {
  const setting = await prisma.systemSetting.findUnique({
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
    value: setting.value as boolean | number,
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
      affiliateBatchSize,
      priceHeartbeatHours,
      affiliateRunRetentionDays,
      // Queue history settings
      queueHistoryRetentionCount,
      queueHistoryCrawl,
      queueHistoryFetch,
      queueHistoryExtract,
      queueHistoryNormalize,
      queueHistoryWrite,
      queueHistoryAlert,
      queueHistoryDealerFeedIngest,
      queueHistoryDealerSkuMatch,
      queueHistoryDealerBenchmark,
      queueHistoryDealerInsight,
      queueHistoryAffiliateFeed,
      queueHistoryAffiliateScheduler,
      // Feature flags
      maintenanceMode,
      registrationEnabled,
      aiSearchEnabled,
      vectorSearchEnabled,
      emailNotificationsEnabled,
      alertProcessingEnabled,
    ] = await Promise.all([
      getSystemSetting(SETTING_KEYS.ALLOW_PLAIN_FTP),
      getSystemSetting(SETTING_KEYS.HARVESTER_SCHEDULER_ENABLED),
      getSystemSetting(SETTING_KEYS.AFFILIATE_SCHEDULER_ENABLED),
      getSystemSetting(SETTING_KEYS.AFFILIATE_BATCH_SIZE),
      getSystemSetting(SETTING_KEYS.PRICE_HEARTBEAT_HOURS),
      getSystemSetting(SETTING_KEYS.AFFILIATE_RUN_RETENTION_DAYS),
      // Queue history settings
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_RETENTION_COUNT),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_CRAWL),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_FETCH),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_EXTRACT),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_NORMALIZE),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_WRITE),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_ALERT),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_DEALER_FEED_INGEST),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_DEALER_SKU_MATCH),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_DEALER_BENCHMARK),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_DEALER_INSIGHT),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_FEED),
      getSystemSetting(SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_SCHEDULER),
      // Feature flags
      getSystemSetting(SETTING_KEYS.MAINTENANCE_MODE),
      getSystemSetting(SETTING_KEYS.REGISTRATION_ENABLED),
      getSystemSetting(SETTING_KEYS.AI_SEARCH_ENABLED),
      getSystemSetting(SETTING_KEYS.VECTOR_SEARCH_ENABLED),
      getSystemSetting(SETTING_KEYS.EMAIL_NOTIFICATIONS_ENABLED),
      getSystemSetting(SETTING_KEYS.ALERT_PROCESSING_ENABLED),
    ]);

    return {
      success: true,
      settings: {
        dangerZone: {
          allowPlainFtp,
          harvesterSchedulerEnabled,
          affiliateSchedulerEnabled,
        },
        operations: {
          affiliateBatchSize,
          priceHeartbeatHours,
          affiliateRunRetentionDays,
        },
        queueHistory: {
          retentionCount: queueHistoryRetentionCount,
          crawl: queueHistoryCrawl,
          fetch: queueHistoryFetch,
          extract: queueHistoryExtract,
          normalize: queueHistoryNormalize,
          write: queueHistoryWrite,
          alert: queueHistoryAlert,
          dealerFeedIngest: queueHistoryDealerFeedIngest,
          dealerSkuMatch: queueHistoryDealerSkuMatch,
          dealerBenchmark: queueHistoryDealerBenchmark,
          dealerInsight: queueHistoryDealerInsight,
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
  value: boolean | number,
  session: { userId: string; email: string }
) {
  try {
    const oldSetting = await prisma.systemSetting.findUnique({
      where: { key },
    });

    const oldValue = oldSetting?.value ?? SETTING_DEFAULTS[key];

    await prisma.systemSetting.upsert({
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
