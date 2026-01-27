/**
 * Harvester Logger Configuration
 *
 * Pre-configured loggers for harvester components
 * Error/fatal logs notify Slack (#data-feed-alerts) via feeds webhook.
 */

import { createLogger } from '@ironscout/logger'
import { wrapLoggerWithSlack } from '@ironscout/notifications'

// Root logger for harvester service
const rootLogger = wrapLoggerWithSlack(createLogger('harvester'), { service: 'harvester' })

// Pre-configured child loggers for harvester components
export const logger = {
  root: rootLogger,
  worker: rootLogger.child('worker'),
  redis: rootLogger.child('redis'),
  database: rootLogger.child('database'),
  scheduler: rootLogger.child('scheduler'),
  fetcher: rootLogger.child('fetcher'),
  extractor: rootLogger.child('extractor'),
  normalizer: rootLogger.child('normalizer'),
  writer: rootLogger.child('writer'),
  alerter: rootLogger.child('alerter'),
  merchant: rootLogger.child('merchant'),
  affiliate: rootLogger.child('affiliate'),
  resolver: rootLogger.child('resolver'),
  embedding: rootLogger.child('embedding'),
  quarantine: rootLogger.child('quarantine'),
  currentprice: rootLogger.child('currentprice'),
}

// Export root logger for custom child creation
export { rootLogger }
