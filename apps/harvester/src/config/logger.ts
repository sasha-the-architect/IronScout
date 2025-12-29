/**
 * Harvester Logger Configuration
 *
 * Pre-configured loggers for harvester components
 */

import { createLogger } from '@ironscout/logger'

// Root logger for harvester service
const rootLogger = createLogger('harvester')

// Pre-configured child loggers for harvester components
export const logger = {
  worker: rootLogger.child('worker'),
  redis: rootLogger.child('redis'),
  database: rootLogger.child('database'),
  scheduler: rootLogger.child('scheduler'),
  fetcher: rootLogger.child('fetcher'),
  extractor: rootLogger.child('extractor'),
  normalizer: rootLogger.child('normalizer'),
  writer: rootLogger.child('writer'),
  alerter: rootLogger.child('alerter'),
  dealer: rootLogger.child('dealer'),
  affiliate: rootLogger.child('affiliate'),
}

// Export root logger for custom child creation
export { rootLogger }
