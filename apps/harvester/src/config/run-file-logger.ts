/**
 * Run File Logger
 *
 * Creates per-run log files for feed ingestion jobs.
 * Logs are written alongside console output for archival/debugging.
 *
 * Output paths:
 *   logs/datafeeds/affiliate/<retailer_slug>/<timestamp>.log
 *   logs/datafeeds/retailers/<timestamp>.log
 *
 * Features:
 *   - Human-readable format
 *   - Auto-cleanup of logs older than 7 days
 */

import { createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync, rmdirSync, WriteStream } from 'fs'
import { join, dirname } from 'path'
import type { ILogger, LogContext } from '@ironscout/logger'

// Base directory for datafeed logs (relative to repo root)
const DATAFEED_LOG_DIR = join(process.cwd(), 'logs', 'datafeeds')

// Log retention in days
const LOG_RETENTION_DAYS = 7

/**
 * Slugify a name for filesystem safety
 * "Bob's Ammo & Guns" -> "bobs-ammo-guns"
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')           // Remove apostrophes
    .replace(/&/g, 'and')           // Replace & with 'and'
    .replace(/[^a-z0-9]+/g, '-')    // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')        // Trim leading/trailing hyphens
    .replace(/-+/g, '-')            // Collapse multiple hyphens
    || 'unknown'                    // Fallback if empty
}

/**
 * Generate ISO timestamp suitable for filenames
 * "2026-01-09T14-41-01-248Z"
 */
function fileTimestamp(): string {
  return new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-')
}

/**
 * Format log level with padding and color codes (for terminal viewing)
 */
function formatLevel(level: string): string {
  return level.toUpperCase().padEnd(5)
}

/**
 * Format a log entry for human readability
 */
function formatEntry(
  level: string,
  message: string,
  runId: string,
  feedId: string,
  meta?: LogContext,
  error?: unknown
): string {
  const timestamp = new Date().toISOString()
  const levelStr = formatLevel(level)

  // Build metadata string (excluding common fields)
  const metaEntries = meta ? Object.entries(meta).filter(([k]) => !['runId', 'feedId'].includes(k)) : []
  const metaStr = metaEntries.length > 0
    ? ' ' + metaEntries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')
    : ''

  let line = `${timestamp} ${levelStr} [run:${runId.slice(-8)}] ${message}${metaStr}`

  if (error) {
    if (error instanceof Error) {
      line += `\n  ERROR: ${error.name}: ${error.message}`
      if (error.stack) {
        const stackLines = error.stack.split('\n').slice(1, 6) // First 5 stack frames
        line += '\n' + stackLines.map(l => '  ' + l.trim()).join('\n')
      }
    } else {
      line += `\n  ERROR: ${String(error)}`
    }
  }

  return line
}

/**
 * Clean up old log files (older than LOG_RETENTION_DAYS)
 * Runs asynchronously, errors are silently ignored
 */
function cleanupOldLogs(baseDir: string): void {
  setImmediate(() => {
    try {
      const cutoff = Date.now() - (LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)
      cleanupDirectory(baseDir, cutoff)
    } catch {
      // Ignore cleanup errors
    }
  })
}

function cleanupDirectory(dir: string, cutoffMs: number): void {
  try {
    const entries = readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        cleanupDirectory(fullPath, cutoffMs)
        // Remove empty directories
        try {
          const remaining = readdirSync(fullPath)
          if (remaining.length === 0) {
            rmdirSync(fullPath)
          }
        } catch {
          // Ignore
        }
      } else if (entry.isFile() && entry.name.endsWith('.log')) {
        try {
          const stat = statSync(fullPath)
          if (stat.mtimeMs < cutoffMs) {
            unlinkSync(fullPath)
          }
        } catch {
          // Ignore individual file errors
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
}

export type RunLoggerType = 'affiliate' | 'retailer'

export interface RunFileLoggerOptions {
  type: RunLoggerType
  /** Retailer name for affiliate feeds (used for grouping) */
  retailerName?: string
  /** Run ID for correlation */
  runId: string
  /** Feed ID for correlation */
  feedId: string
}

export interface RunFileLogger extends ILogger {
  /** Close the file stream - call when run completes */
  close(): Promise<void>
  /** Get the log file path */
  readonly filePath: string
}

/**
 * Create a file logger for a specific run
 *
 * Writes human-readable logs to:
 *   logs/datafeeds/affiliate/<retailer_slug>/<timestamp>.log
 *   logs/datafeeds/retailers/<timestamp>.log
 */
export function createRunFileLogger(options: RunFileLoggerOptions): RunFileLogger {
  const { type, retailerName, runId, feedId } = options

  const timestamp = fileTimestamp()
  let dir: string
  let filePath: string

  if (type === 'affiliate' && retailerName) {
    const slug = slugify(retailerName)
    dir = join(DATAFEED_LOG_DIR, 'affiliate', slug)
    filePath = join(dir, `${timestamp}.log`)
  } else {
    // Retailer feeds go directly into retailers/ without grouping
    dir = join(DATAFEED_LOG_DIR, 'retailers')
    filePath = join(dir, `${timestamp}.log`)
  }

  // Ensure directory exists
  mkdirSync(dir, { recursive: true })

  // Create write stream
  const stream: WriteStream = createWriteStream(filePath, { flags: 'a' })

  // Track if stream is open
  let isOpen = true

  // Trigger cleanup of old logs (async, non-blocking)
  cleanupOldLogs(DATAFEED_LOG_DIR)

  function writeEntry(
    level: string,
    message: string,
    meta?: LogContext,
    error?: unknown
  ): void {
    if (!isOpen) return
    const line = formatEntry(level, message, runId, feedId, meta, error)
    stream.write(line + '\n')
  }

  const logger: RunFileLogger = {
    filePath,

    debug(message: string, meta?: LogContext): void {
      writeEntry('debug', message, meta)
    },

    info(message: string, meta?: LogContext): void {
      writeEntry('info', message, meta)
    },

    warn(message: string, meta?: LogContext, error?: unknown): void {
      writeEntry('warn', message, meta, error)
    },

    error(message: string, meta?: LogContext, error?: unknown): void {
      writeEntry('error', message, meta, error)
    },

    fatal(message: string, meta?: LogContext, error?: unknown): void {
      writeEntry('fatal', message, meta, error)
    },

    child(componentOrContext: string | LogContext, defaultContext?: LogContext): ILogger {
      // For file logger, child just adds context to subsequent logs
      const childMeta = typeof componentOrContext === 'string'
        ? { component: componentOrContext, ...defaultContext }
        : componentOrContext

      return {
        debug: (msg, meta) => writeEntry('debug', msg, { ...childMeta, ...meta }),
        info: (msg, meta) => writeEntry('info', msg, { ...childMeta, ...meta }),
        warn: (msg, meta, err) => writeEntry('warn', msg, { ...childMeta, ...meta }, err),
        error: (msg, meta, err) => writeEntry('error', msg, { ...childMeta, ...meta }, err),
        fatal: (msg, meta, err) => writeEntry('fatal', msg, { ...childMeta, ...meta }, err),
        child: (c, d) => logger.child(
          typeof c === 'string' ? { ...childMeta, component: c, ...d } : { ...childMeta, ...c }
        ),
      }
    },

    async close(): Promise<void> {
      if (!isOpen) return
      isOpen = false

      return new Promise((resolve, reject) => {
        stream.end(() => {
          stream.close((err) => {
            if (err) reject(err)
            else resolve()
          })
        })
      })
    },
  }

  // Log header
  const header = [
    '='.repeat(80),
    `Feed Run Log`,
    `Type: ${type}`,
    retailerName ? `Retailer: ${retailerName}` : '',
    `Feed ID: ${feedId}`,
    `Run ID: ${runId}`,
    `Started: ${new Date().toISOString()}`,
    '='.repeat(80),
    '',
  ].filter(Boolean).join('\n')

  stream.write(header + '\n')

  return logger
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLVER FILE LOGGER (Daily Rolling)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get today's date in YYYY-MM-DD format
 */
function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Format a resolver log entry
 */
function formatResolverEntry(
  level: string,
  sourceProductId: string,
  message: string,
  meta?: LogContext,
  error?: unknown
): string {
  const timestamp = new Date().toISOString()
  const levelStr = formatLevel(level)
  const shortId = sourceProductId.slice(-8)

  const metaEntries = meta ? Object.entries(meta) : []
  const metaStr = metaEntries.length > 0
    ? ' ' + metaEntries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')
    : ''

  let line = `${timestamp} ${levelStr} [sp:${shortId}] ${message}${metaStr}`

  if (error) {
    if (error instanceof Error) {
      line += `\n  ERROR: ${error.name}: ${error.message}`
    } else {
      line += `\n  ERROR: ${String(error)}`
    }
  }

  return line
}

// Per-run resolver streams (keyed by runId)
const resolverStreams = new Map<string, WriteStream>()
const resolverStreamPaths = new Map<string, string>()

// Fallback daily stream for jobs without runId (RECONCILE/MANUAL)
let dailyResolverStream: WriteStream | null = null
let dailyResolverStreamDate: string | null = null
let dailyResolverFilePath: string | null = null

/**
 * Get or create a resolver file logger stream for a specific run
 * Per-run files: logs/datafeeds/resolver/<run_id>.log
 * Daily fallback: logs/datafeeds/resolver/daily-<date>.log
 */
function getResolverStream(affiliateFeedRunId?: string): WriteStream {
  // If no runId, use daily rolling file
  if (!affiliateFeedRunId) {
    return getDailyResolverStream()
  }

  // Check if we already have a stream for this run
  const existing = resolverStreams.get(affiliateFeedRunId)
  if (existing) {
    return existing
  }

  // Create new stream for this run
  const dir = join(DATAFEED_LOG_DIR, 'resolver')
  mkdirSync(dir, { recursive: true })

  const filePath = join(dir, `${affiliateFeedRunId}.log`)
  const stream = createWriteStream(filePath, { flags: 'a' })

  // Write header
  const header = [
    '='.repeat(80),
    `Resolver Log`,
    `Run ID: ${affiliateFeedRunId}`,
    `Started: ${new Date().toISOString()}`,
    '='.repeat(80),
    '',
  ].join('\n')
  stream.write(header + '\n')

  resolverStreams.set(affiliateFeedRunId, stream)
  resolverStreamPaths.set(affiliateFeedRunId, filePath)

  // Trigger cleanup of old logs (async)
  cleanupOldLogs(DATAFEED_LOG_DIR)

  return stream
}

/**
 * Get daily rolling stream for resolver jobs without runId
 */
function getDailyResolverStream(): WriteStream {
  const today = todayDate()

  if (dailyResolverStream && dailyResolverStreamDate === today) {
    return dailyResolverStream
  }

  // Close old stream if date changed
  if (dailyResolverStream) {
    dailyResolverStream.end()
    dailyResolverStream = null
  }

  const dir = join(DATAFEED_LOG_DIR, 'resolver')
  mkdirSync(dir, { recursive: true })

  dailyResolverFilePath = join(dir, `daily-${today}.log`)
  dailyResolverStreamDate = today
  dailyResolverStream = createWriteStream(dailyResolverFilePath, { flags: 'a' })

  return dailyResolverStream
}

export interface ResolverLogEntry {
  sourceProductId: string
  matchType: string
  status: string
  reasonCode?: string | null
  confidence: number | string
  productId?: string | null
  durationMs: number
  trigger: string
  skipped?: boolean
  createdProduct?: boolean
  /** Originating feed run ID for per-run log files */
  affiliateFeedRunId?: string
}

/**
 * Log a resolver result to a per-run or daily log file
 *
 * Output:
 *   With runId: logs/datafeeds/resolver/<affiliateFeedRunId>.log
 *   Without:    logs/datafeeds/resolver/daily-2026-01-09.log
 *
 * Format:
 * 2026-01-09T14:41:01.248Z INFO  [sp:7ad7owzj] MATCHED matchType="UPC_EXACT" confidence=1.0 productId="clx..."
 */
export function logResolverResult(entry: ResolverLogEntry): void {
  const stream = getResolverStream(entry.affiliateFeedRunId)

  const {
    sourceProductId,
    matchType,
    status,
    reasonCode,
    confidence,
    productId,
    durationMs,
    trigger,
    skipped,
    createdProduct,
  } = entry

  const level = status === 'ERROR' ? 'error' : status === 'UNMATCHED' ? 'warn' : 'info'
  const message = skipped ? `SKIPPED (${reasonCode || 'unchanged'})` : status

  const meta: LogContext = {
    matchType,
    confidence,
    durationMs,
    trigger,
  }

  if (productId) meta.productId = productId
  if (reasonCode && !skipped) meta.reasonCode = reasonCode
  if (createdProduct) meta.createdProduct = true

  const line = formatResolverEntry(level, sourceProductId, message, meta)
  stream.write(line + '\n')
}

/**
 * Log a resolver error to a per-run or daily log file
 */
export function logResolverError(
  sourceProductId: string,
  message: string,
  meta?: LogContext,
  error?: unknown,
  affiliateFeedRunId?: string
): void {
  const stream = getResolverStream(affiliateFeedRunId)
  const line = formatResolverEntry('error', sourceProductId, message, meta, error)
  stream.write(line + '\n')
}

/**
 * Close a specific resolver run's log stream
 */
export async function closeResolverRunLogger(affiliateFeedRunId: string): Promise<void> {
  const stream = resolverStreams.get(affiliateFeedRunId)
  if (stream) {
    return new Promise((resolve) => {
      stream.end(() => {
        resolverStreams.delete(affiliateFeedRunId)
        resolverStreamPaths.delete(affiliateFeedRunId)
        resolve()
      })
    })
  }
}

/**
 * Close all resolver logger streams (call on shutdown)
 */
export async function closeResolverLogger(): Promise<void> {
  const closePromises: Promise<void>[] = []

  // Close all per-run streams
  for (const [runId, stream] of resolverStreams) {
    closePromises.push(
      new Promise((resolve) => {
        stream.end(() => {
          resolverStreams.delete(runId)
          resolverStreamPaths.delete(runId)
          resolve()
        })
      })
    )
  }

  // Close daily stream
  if (dailyResolverStream) {
    closePromises.push(
      new Promise((resolve) => {
        dailyResolverStream!.end(() => {
          dailyResolverStream = null
          dailyResolverStreamDate = null
          dailyResolverFilePath = null
          resolve()
        })
      })
    )
  }

  await Promise.all(closePromises)
}

/**
 * Get the resolver log file path for a run (for testing/debugging)
 */
export function getResolverLogPath(affiliateFeedRunId?: string): string | null {
  if (affiliateFeedRunId) {
    return resolverStreamPaths.get(affiliateFeedRunId) ?? null
  }
  return dailyResolverFilePath
}

// ═══════════════════════════════════════════════════════════════════════════════
// DUAL LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a composite logger that writes to both console and file
 */
export function createDualLogger(
  consoleLogger: ILogger,
  fileLogger: RunFileLogger
): ILogger & { close: () => Promise<void>; filePath: string } {
  return {
    filePath: fileLogger.filePath,

    debug(message: string, meta?: LogContext): void {
      consoleLogger.debug(message, meta)
      fileLogger.debug(message, meta)
    },

    info(message: string, meta?: LogContext): void {
      consoleLogger.info(message, meta)
      fileLogger.info(message, meta)
    },

    warn(message: string, meta?: LogContext, error?: unknown): void {
      consoleLogger.warn(message, meta, error)
      fileLogger.warn(message, meta, error)
    },

    error(message: string, meta?: LogContext, error?: unknown): void {
      consoleLogger.error(message, meta, error)
      fileLogger.error(message, meta, error)
    },

    fatal(message: string, meta?: LogContext, error?: unknown): void {
      consoleLogger.fatal(message, meta, error)
      fileLogger.fatal(message, meta, error)
    },

    child(componentOrContext: string | LogContext, defaultContext?: LogContext): ILogger {
      return createDualLogger(
        consoleLogger.child(componentOrContext, defaultContext),
        fileLogger.child(componentOrContext, defaultContext) as RunFileLogger
      )
    },

    async close(): Promise<void> {
      await fileLogger.close()
    },
  }
}
