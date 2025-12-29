/**
 * Admin Portal Logger Configuration
 *
 * Pre-configured loggers for admin portal components
 * Uses @ironscout/logger for structured logging
 */

import { createLogger, type ILogger, type LogContext } from '@ironscout/logger'

// Root logger for admin service
const rootLogger = createLogger('admin')

// Pre-configured child loggers for admin components
export const logger = rootLogger
export const loggers = {
  auth: rootLogger.child('auth'),
  dealers: rootLogger.child('dealers'),
  feeds: rootLogger.child('feeds'),
  payments: rootLogger.child('payments'),
  users: rootLogger.child('users'),
  sources: rootLogger.child('sources'),
}

// Re-export types for backwards compatibility
export type { LogContext, ILogger }
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'
