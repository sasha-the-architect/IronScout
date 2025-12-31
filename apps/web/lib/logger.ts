/**
 * Web App Logger
 *
 * Re-exports the shared @ironscout/logger which works in both
 * Node.js (server components) and browser (client components).
 *
 * The shared logger automatically detects the environment and:
 * - Uses ANSI colors in Node.js terminal
 * - Uses CSS colors in browser dev tools
 * - Supports localStorage for LOG_LEVEL override in browser
 */

import { createLogger, type ILogger, type LogContext } from '@ironscout/logger'

// Re-export types
export type { ILogger, LogContext }

// Re-export createLogger
export { createLogger }

// Pre-configured loggers for common web components
export const logger = {
  api: createLogger('web:api'),
  auth: createLogger('web:auth'),
  search: createLogger('web:search'),
  dashboard: createLogger('web:dashboard'),
}
