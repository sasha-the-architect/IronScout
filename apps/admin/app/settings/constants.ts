// =============================================================================
// System Settings Keys
// =============================================================================

export const SETTING_KEYS = {
  // Danger Zone - security/stability impact, require double confirmation
  ALLOW_PLAIN_FTP: 'AFFILIATE_FEED_ALLOW_PLAIN_FTP',
  HARVESTER_SCHEDULER_ENABLED: 'HARVESTER_SCHEDULER_ENABLED',
  AFFILIATE_SCHEDULER_ENABLED: 'AFFILIATE_FEED_SCHEDULER_ENABLED',

  // Operations Settings - tunable parameters
  AFFILIATE_BATCH_SIZE: 'AFFILIATE_BATCH_SIZE',
  PRICE_HEARTBEAT_HOURS: 'PRICE_HEARTBEAT_HOURS',
  AFFILIATE_RUN_RETENTION_DAYS: 'AFFILIATE_RUN_RETENTION_DAYS',
  HARVESTER_LOG_LEVEL: 'HARVESTER_LOG_LEVEL',

  // Queue History Settings - Bull Board job retention
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

  // Feature Flags - enable/disable features
  MAINTENANCE_MODE: 'MAINTENANCE_MODE',
  REGISTRATION_ENABLED: 'REGISTRATION_ENABLED',
  AI_SEARCH_ENABLED: 'AI_SEARCH_ENABLED',
  VECTOR_SEARCH_ENABLED: 'VECTOR_SEARCH_ENABLED',
  EMAIL_NOTIFICATIONS_ENABLED: 'EMAIL_NOTIFICATIONS_ENABLED',
  ALERT_PROCESSING_ENABLED: 'ALERT_PROCESSING_ENABLED',
} as const;

export type SettingKey = typeof SETTING_KEYS[keyof typeof SETTING_KEYS];

// =============================================================================
// Setting Categories
// =============================================================================

export const DANGER_ZONE_KEYS = [
  SETTING_KEYS.ALLOW_PLAIN_FTP,
  SETTING_KEYS.HARVESTER_SCHEDULER_ENABLED,
  SETTING_KEYS.AFFILIATE_SCHEDULER_ENABLED,
] as const;

export const OPERATIONS_KEYS = [
  SETTING_KEYS.AFFILIATE_BATCH_SIZE,
  SETTING_KEYS.PRICE_HEARTBEAT_HOURS,
  SETTING_KEYS.AFFILIATE_RUN_RETENTION_DAYS,
  SETTING_KEYS.HARVESTER_LOG_LEVEL,
] as const;

export const QUEUE_HISTORY_KEYS = [
  SETTING_KEYS.QUEUE_HISTORY_RETENTION_COUNT,
  SETTING_KEYS.QUEUE_HISTORY_CRAWL,
  SETTING_KEYS.QUEUE_HISTORY_FETCH,
  SETTING_KEYS.QUEUE_HISTORY_EXTRACT,
  SETTING_KEYS.QUEUE_HISTORY_NORMALIZE,
  SETTING_KEYS.QUEUE_HISTORY_WRITE,
  SETTING_KEYS.QUEUE_HISTORY_ALERT,
  SETTING_KEYS.QUEUE_HISTORY_MERCHANT_FEED_INGEST,
  SETTING_KEYS.QUEUE_HISTORY_MERCHANT_SKU_MATCH,
  SETTING_KEYS.QUEUE_HISTORY_MERCHANT_BENCHMARK,
  SETTING_KEYS.QUEUE_HISTORY_MERCHANT_INSIGHT,
  SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_FEED,
  SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_SCHEDULER,
] as const;

export const FEATURE_FLAG_KEYS = [
  SETTING_KEYS.MAINTENANCE_MODE,
  SETTING_KEYS.REGISTRATION_ENABLED,
  SETTING_KEYS.AI_SEARCH_ENABLED,
  SETTING_KEYS.VECTOR_SEARCH_ENABLED,
  SETTING_KEYS.EMAIL_NOTIFICATIONS_ENABLED,
  SETTING_KEYS.ALERT_PROCESSING_ENABLED,
] as const;

// =============================================================================
// Default Values
// =============================================================================

export const SETTING_DEFAULTS: Record<SettingKey, boolean | number | string> = {
  // Danger Zone
  [SETTING_KEYS.ALLOW_PLAIN_FTP]: false,
  [SETTING_KEYS.HARVESTER_SCHEDULER_ENABLED]: true,
  [SETTING_KEYS.AFFILIATE_SCHEDULER_ENABLED]: true,

  // Operations
  [SETTING_KEYS.AFFILIATE_BATCH_SIZE]: 1000,
  [SETTING_KEYS.PRICE_HEARTBEAT_HOURS]: 24,
  [SETTING_KEYS.AFFILIATE_RUN_RETENTION_DAYS]: 30,
  [SETTING_KEYS.HARVESTER_LOG_LEVEL]: 'info',

  // Queue History (all enabled by default for visibility)
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
};

// =============================================================================
// Setting Descriptions
// =============================================================================

export const SETTING_DESCRIPTIONS: Record<SettingKey, string> = {
  // Danger Zone
  [SETTING_KEYS.ALLOW_PLAIN_FTP]: 'Allow plain FTP connections for affiliate feeds (insecure - credentials sent in cleartext)',
  [SETTING_KEYS.HARVESTER_SCHEDULER_ENABLED]: 'Enable the main harvester scheduler (disabling stops all scheduled harvesting)',
  [SETTING_KEYS.AFFILIATE_SCHEDULER_ENABLED]: 'Enable the affiliate feed scheduler (disabling stops scheduled feed processing)',

  // Operations
  [SETTING_KEYS.AFFILIATE_BATCH_SIZE]: 'Number of items to process per batch in affiliate feeds',
  [SETTING_KEYS.PRICE_HEARTBEAT_HOURS]: 'Hours between price heartbeat updates',
  [SETTING_KEYS.AFFILIATE_RUN_RETENTION_DAYS]: 'Days to retain affiliate feed run history',
  [SETTING_KEYS.HARVESTER_LOG_LEVEL]: 'Log verbosity level for harvester (debug, info, warn, error, fatal). Takes effect without restart.',

  // Queue History
  [SETTING_KEYS.QUEUE_HISTORY_RETENTION_COUNT]: 'Number of completed/failed jobs to retain per queue',
  [SETTING_KEYS.QUEUE_HISTORY_CRAWL]: 'Retain job history for crawl queue',
  [SETTING_KEYS.QUEUE_HISTORY_FETCH]: 'Retain job history for fetch queue',
  [SETTING_KEYS.QUEUE_HISTORY_EXTRACT]: 'Retain job history for extract queue',
  [SETTING_KEYS.QUEUE_HISTORY_NORMALIZE]: 'Retain job history for normalize queue',
  [SETTING_KEYS.QUEUE_HISTORY_WRITE]: 'Retain job history for write queue',
  [SETTING_KEYS.QUEUE_HISTORY_ALERT]: 'Retain job history for alert queue',
  [SETTING_KEYS.QUEUE_HISTORY_MERCHANT_FEED_INGEST]: 'Retain job history for merchant feed ingest queue',
  [SETTING_KEYS.QUEUE_HISTORY_MERCHANT_SKU_MATCH]: 'Retain job history for merchant SKU match queue',
  [SETTING_KEYS.QUEUE_HISTORY_MERCHANT_BENCHMARK]: 'Retain job history for merchant benchmark queue',
  [SETTING_KEYS.QUEUE_HISTORY_MERCHANT_INSIGHT]: 'Retain job history for merchant insight queue',
  [SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_FEED]: 'Retain job history for affiliate feed queue',
  [SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_SCHEDULER]: 'Retain job history for affiliate scheduler queue',

  // Feature Flags
  [SETTING_KEYS.MAINTENANCE_MODE]: 'Display maintenance banner and disable writes across all apps',
  [SETTING_KEYS.REGISTRATION_ENABLED]: 'Allow new user registrations',
  [SETTING_KEYS.AI_SEARCH_ENABLED]: 'Enable AI-powered search intent parsing',
  [SETTING_KEYS.VECTOR_SEARCH_ENABLED]: 'Enable vector-enhanced search results',
  [SETTING_KEYS.EMAIL_NOTIFICATIONS_ENABLED]: 'Enable sending email notifications (global kill switch)',
  [SETTING_KEYS.ALERT_PROCESSING_ENABLED]: 'Enable alert evaluation and notification',
};

// =============================================================================
// Setting Types
// =============================================================================

export type SettingType = 'boolean' | 'number' | 'string';

export const SETTING_TYPES: Record<SettingKey, SettingType> = {
  // Danger Zone - all boolean
  [SETTING_KEYS.ALLOW_PLAIN_FTP]: 'boolean',
  [SETTING_KEYS.HARVESTER_SCHEDULER_ENABLED]: 'boolean',
  [SETTING_KEYS.AFFILIATE_SCHEDULER_ENABLED]: 'boolean',

  // Operations - numbers and strings
  [SETTING_KEYS.AFFILIATE_BATCH_SIZE]: 'number',
  [SETTING_KEYS.PRICE_HEARTBEAT_HOURS]: 'number',
  [SETTING_KEYS.AFFILIATE_RUN_RETENTION_DAYS]: 'number',
  [SETTING_KEYS.HARVESTER_LOG_LEVEL]: 'string',

  // Queue History - one number, rest boolean
  [SETTING_KEYS.QUEUE_HISTORY_RETENTION_COUNT]: 'number',
  [SETTING_KEYS.QUEUE_HISTORY_CRAWL]: 'boolean',
  [SETTING_KEYS.QUEUE_HISTORY_FETCH]: 'boolean',
  [SETTING_KEYS.QUEUE_HISTORY_EXTRACT]: 'boolean',
  [SETTING_KEYS.QUEUE_HISTORY_NORMALIZE]: 'boolean',
  [SETTING_KEYS.QUEUE_HISTORY_WRITE]: 'boolean',
  [SETTING_KEYS.QUEUE_HISTORY_ALERT]: 'boolean',
  [SETTING_KEYS.QUEUE_HISTORY_MERCHANT_FEED_INGEST]: 'boolean',
  [SETTING_KEYS.QUEUE_HISTORY_MERCHANT_SKU_MATCH]: 'boolean',
  [SETTING_KEYS.QUEUE_HISTORY_MERCHANT_BENCHMARK]: 'boolean',
  [SETTING_KEYS.QUEUE_HISTORY_MERCHANT_INSIGHT]: 'boolean',
  [SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_FEED]: 'boolean',
  [SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_SCHEDULER]: 'boolean',

  // Feature Flags - all boolean
  [SETTING_KEYS.MAINTENANCE_MODE]: 'boolean',
  [SETTING_KEYS.REGISTRATION_ENABLED]: 'boolean',
  [SETTING_KEYS.AI_SEARCH_ENABLED]: 'boolean',
  [SETTING_KEYS.VECTOR_SEARCH_ENABLED]: 'boolean',
  [SETTING_KEYS.EMAIL_NOTIFICATIONS_ENABLED]: 'boolean',
  [SETTING_KEYS.ALERT_PROCESSING_ENABLED]: 'boolean',
};

// =============================================================================
// Validation Ranges for Number Settings
// =============================================================================

export const NUMBER_SETTING_RANGES: Record<string, { min: number; max: number }> = {
  [SETTING_KEYS.AFFILIATE_BATCH_SIZE]: { min: 100, max: 10000 },
  [SETTING_KEYS.PRICE_HEARTBEAT_HOURS]: { min: 1, max: 168 },
  [SETTING_KEYS.AFFILIATE_RUN_RETENTION_DAYS]: { min: 7, max: 365 },
  [SETTING_KEYS.QUEUE_HISTORY_RETENTION_COUNT]: { min: 10, max: 1000 },
};

// =============================================================================
// Queue Display Names (for UI)
// =============================================================================

export const QUEUE_DISPLAY_NAMES: Record<string, string> = {
  [SETTING_KEYS.QUEUE_HISTORY_CRAWL]: 'Crawl',
  [SETTING_KEYS.QUEUE_HISTORY_FETCH]: 'Fetch',
  [SETTING_KEYS.QUEUE_HISTORY_EXTRACT]: 'Extract',
  [SETTING_KEYS.QUEUE_HISTORY_NORMALIZE]: 'Normalize',
  [SETTING_KEYS.QUEUE_HISTORY_WRITE]: 'Write',
  [SETTING_KEYS.QUEUE_HISTORY_ALERT]: 'Alert',
  [SETTING_KEYS.QUEUE_HISTORY_MERCHANT_FEED_INGEST]: 'Merchant Feed Ingest',
  [SETTING_KEYS.QUEUE_HISTORY_MERCHANT_SKU_MATCH]: 'Merchant SKU Match',
  [SETTING_KEYS.QUEUE_HISTORY_MERCHANT_BENCHMARK]: 'Merchant Benchmark',
  [SETTING_KEYS.QUEUE_HISTORY_MERCHANT_INSIGHT]: 'Merchant Insight',
  [SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_FEED]: 'Affiliate Feed',
  [SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_SCHEDULER]: 'Affiliate Scheduler',
};

// =============================================================================
// Log Level Options
// =============================================================================

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
export type LogLevel = typeof LOG_LEVELS[number];

export const LOG_LEVEL_DESCRIPTIONS: Record<LogLevel, string> = {
  debug: 'Most verbose - all logs including fine-grained debugging',
  info: 'Standard - informational messages and above',
  warn: 'Warnings and errors only',
  error: 'Errors and fatal only',
  fatal: 'Fatal errors only',
};
