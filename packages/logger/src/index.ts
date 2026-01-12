/**
 * @ironscout/logger
 *
 * Structured logging for all IronScout applications.
 * Works in both Node.js and browser environments.
 *
 * Features:
 * - JSON-formatted output for production (machine-parseable)
 * - Colored output for development (human-readable)
 * - ISO 8601 timestamps
 * - Log levels: debug, info, warn, error, fatal
 * - Structured metadata support
 * - Child loggers with inherited context
 * - Environment-based configuration
 * - Request ID + Trace ID correlation via AsyncLocalStorage (Node.js only)
 * - Automatic PII/secrets redaction
 * - Sampling for high-volume events
 *
 * Environment variables (Node.js only):
 * - LOG_LEVEL: Minimum log level (debug, info, warn, error, fatal). Default: info
 * - LOG_FORMAT: Output format (json, pretty). Default: json in production, pretty in development
 * - LOG_ASYNC: Enable async buffered logging (true/1). Default: false
 * - LOG_REDACT: Enable automatic redaction (true/1). Default: true in production
 * - NODE_ENV: Used to determine defaults
 *
 * Browser behavior:
 * - Uses 'pretty' format with CSS colors in dev tools
 * - LOG_LEVEL defaults to 'info' (can be overridden via localStorage)
 * - Request context features are no-ops (AsyncLocalStorage not available)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

/**
 * Request context for correlation across log entries
 */
export interface RequestContext {
  requestId?: string
  traceId?: string
  spanId?: string
  userId?: string
  [key: string]: unknown
}

// Detect environment
const isBrowser = typeof window !== 'undefined'
const isNode = typeof process !== 'undefined' && process.versions?.node

// AsyncLocalStorage for request-scoped context (Node.js only)
// We use dynamic require to avoid bundling async_hooks in browser builds
let requestContextStorage: {
  run: <T>(context: RequestContext, fn: () => T) => T
  getStore: () => RequestContext | undefined
}

if (isNode && !isBrowser) {
  // Node.js environment - use real AsyncLocalStorage
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const asyncHooks = require('async_hooks')
    const storage = new asyncHooks.AsyncLocalStorage()
    requestContextStorage = {
      run: <T>(context: RequestContext, fn: () => T) => storage.run(context, fn),
      getStore: () => storage.getStore() as RequestContext | undefined,
    }
  } catch {
    // Fallback if async_hooks not available
    requestContextStorage = {
      run: <T>(_context: RequestContext, fn: () => T) => fn(),
      getStore: () => undefined,
    }
  }
} else {
  // Browser environment - no-op implementation
  requestContextStorage = {
    run: <T>(_context: RequestContext, fn: () => T) => fn(),
    getStore: () => undefined,
  }
}

/**
 * Run a function with request context
 * All log entries within the callback will include the context fields
 * Note: This is a no-op in browser environments
 */
export function withRequestContext<T>(context: RequestContext, fn: () => T): T {
  return requestContextStorage.run(context, fn)
}

/**
 * Get the current request context (if any)
 * Note: Always returns undefined in browser environments
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore()
}

export interface LogContext {
  [key: string]: unknown
}

interface LogEntry {
  timestamp: string
  level: LogLevel
  service: string
  component?: string
  message: string
  requestId?: string
  traceId?: string
  spanId?: string
  error?: {
    name: string
    message: string
    stack?: string
  }
  [key: string]: unknown
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
}

// =============================================================================
// Redaction - Automatic PII/secrets filtering
// =============================================================================

/**
 * Sensitive field patterns - ALWAYS redacted
 */
const SENSITIVE_PATTERNS = [
  /authorization/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /password/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /access[-_]?token/i,
  /refresh[-_]?token/i,
  /bearer/i,
  /jwt/i,
  /session[-_]?id/i,
  /credit[-_]?card/i,
  /card[-_]?number/i,
  /cvv/i,
  /cvc/i,
  /^pan$/i,
  /account[-_]?number/i,
  /routing[-_]?number/i,
  /ssn/i,
  /social[-_]?security/i,
  /^dob$/i,
  /date[-_]?of[-_]?birth/i,
  /private[-_]?key/i,
]

/**
 * Safe fields that pass through without redaction (allowlist)
 */
const SAFE_FIELDS = new Set([
  // Standard log fields
  'timestamp', 'ts', 'level', 'service', 'component', 'message', 'msg',
  'event', 'event_name', 'env', 'environment', 'version',
  // Request correlation
  'requestId', 'request_id', 'traceId', 'trace_id', 'spanId', 'span_id',
  'correlationId', 'correlation_id',
  // HTTP fields
  'method', 'path', 'route', 'url', 'statusCode', 'status_code',
  'latencyMs', 'latency_ms', 'durationMs', 'duration_ms',
  'contentLength', 'content_length', 'protocol', 'host', 'hostname', 'port',
  'userAgent', 'user_agent', 'ip', 'remoteAddress', 'remote_address',
  // Identifiers (non-sensitive)
  'userId', 'user_id', 'productId', 'product_id', 'orderId', 'order_id',
  'jobId', 'job_id', 'sourceProductId', 'sourceKind',
  // Error fields
  'error', 'errorType', 'error_type', 'errorCode', 'error_code',
  'errorMessage', 'error_message', 'errorName', 'error_name',
  'error_category', 'error_status_code', 'error_is_operational', 'error_is_retryable',
  'stack', 'name', 'code',
  // Business fields
  'caliber', 'brand', 'category', 'purpose', 'tier',
  'count', 'total', 'page', 'limit', 'offset',
  'query', 'sortBy', 'sort_by', 'filter', 'filters',
  // Metrics
  'attemptsMade', 'willRetry', 'isFinalAttempt',
  'processed', 'skipped', 'errors', 'success',
  // Nested objects (will be recursively checked)
  'http', 'error_details', 'meta', 'context', 'data',
])

const REDACTED = '[REDACTED]'

function isSensitiveField(fieldName: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(fieldName))
}

function isSafeField(fieldName: string): boolean {
  return SAFE_FIELDS.has(fieldName)
}

/**
 * Redact sensitive fields from log entry
 */
function redactEntry<T>(obj: T, depth = 0, seen = new WeakSet<object>()): T {
  if (depth > 10) return '[MAX_DEPTH]' as unknown as T
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj

  if (seen.has(obj as object)) return '[CIRCULAR]' as unknown as T
  seen.add(obj as object)

  if (Array.isArray(obj)) {
    return obj.map((item) => redactEntry(item, depth + 1, seen)) as unknown as T
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveField(key)) {
      result[key] = REDACTED
    } else if (isSafeField(key)) {
      result[key] = typeof value === 'object' && value !== null
        ? redactEntry(value, depth + 1, seen)
        : value
    } else if (typeof value === 'boolean' || value === null || value === undefined) {
      result[key] = value
    } else if (typeof value === 'object') {
      result[key] = redactEntry(value, depth + 1, seen)
    } else {
      // Unknown primitive field - redact by default (fail-safe)
      result[key] = REDACTED
    }
  }
  return result as unknown as T
}

// =============================================================================
// Sampling - Rate limit high-volume events
// =============================================================================

interface SampleConfig {
  rate: number // 0.0 to 1.0
  counter: number
}

const sampleConfigs = new Map<string, SampleConfig>()
let defaultSampleRate = 1.0 // Log everything by default

/**
 * Configure sampling rate for an event type
 * @param eventName - Event name or pattern (e.g., 'http.request.end')
 * @param rate - Sample rate from 0.0 (log nothing) to 1.0 (log everything)
 */
export function setSampleRate(eventName: string, rate: number): void {
  sampleConfigs.set(eventName, { rate: Math.max(0, Math.min(1, rate)), counter: 0 })
}

/**
 * Set default sample rate for events without specific config
 */
export function setDefaultSampleRate(rate: number): void {
  defaultSampleRate = Math.max(0, Math.min(1, rate))
}

/**
 * Check if an event should be logged based on sampling
 */
function shouldSample(eventName?: string): boolean {
  if (!eventName) return true

  const config = sampleConfigs.get(eventName)
  if (!config) {
    // Use deterministic sampling for consistency
    return Math.random() < defaultSampleRate
  }

  // Deterministic counter-based sampling
  config.counter++
  const interval = Math.ceil(1 / config.rate)
  return config.counter % interval === 0
}

// =============================================================================
// Log Volume Metrics
// =============================================================================

interface LogMetrics {
  total: number
  byLevel: Record<LogLevel, number>
  byService: Record<string, number>
  sampled: number
  redacted: number
  lastReset: number
}

const metrics: LogMetrics = {
  total: 0,
  byLevel: { debug: 0, info: 0, warn: 0, error: 0, fatal: 0 },
  byService: {},
  sampled: 0,
  redacted: 0,
  lastReset: Date.now(),
}

/**
 * Get current log metrics
 */
export function getLogMetrics(): LogMetrics & { uptimeMs: number } {
  return {
    ...metrics,
    uptimeMs: Date.now() - metrics.lastReset,
  }
}

/**
 * Reset log metrics
 */
export function resetLogMetrics(): void {
  metrics.total = 0
  metrics.byLevel = { debug: 0, info: 0, warn: 0, error: 0, fatal: 0 }
  metrics.byService = {}
  metrics.sampled = 0
  metrics.redacted = 0
  metrics.lastReset = Date.now()
}

// =============================================================================
// Configuration
// =============================================================================

let dynamicLogLevel: LogLevel | null = null
let redactionEnabled: boolean | null = null

function isAsyncEnabled(): boolean {
  if (!isNode || isBrowser) return false
  const flag = getEnv('LOG_ASYNC')
  return flag === 'true' || flag === '1'
}

function isRedactionEnabled(): boolean {
  if (redactionEnabled !== null) return redactionEnabled
  const flag = getEnv('LOG_REDACT')
  if (flag === 'false' || flag === '0') return false
  // Default: enabled in production
  return getEnv('NODE_ENV') === 'production'
}

/**
 * Enable or disable redaction at runtime
 */
export function setRedactionEnabled(enabled: boolean): void {
  redactionEnabled = enabled
}

type PendingLog = { line: string; level: LogLevel }
const asyncQueue: PendingLog[] = []
let asyncFlushPromise: Promise<void> | null = null
let asyncFlushing = false

/**
 * Set the log level dynamically at runtime
 * This takes precedence over LOG_LEVEL env var
 * @param level - The log level to set
 */
export function setLogLevel(level: LogLevel): void {
  if (LOG_LEVELS[level] !== undefined) {
    dynamicLogLevel = level
  }
}

/**
 * Get the current effective log level
 */
export function getCurrentLogLevel(): LogLevel {
  return getLogLevel()
}

// Safe environment variable access
function getEnv(key: string): string | undefined {
  if (isNode && typeof process !== 'undefined' && process.env) {
    return process.env[key]
  }
  if (isBrowser && typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(key) ?? undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

function getLogLevel(): LogLevel {
  // Check dynamic level first (set via setLogLevel())
  if (dynamicLogLevel !== null) {
    return dynamicLogLevel
  }
  // Fall back to env var
  const level = getEnv('LOG_LEVEL')?.toLowerCase() as LogLevel
  if (level && LOG_LEVELS[level] !== undefined) {
    return level
  }
  return 'info'
}

function getLogFormat(): 'json' | 'pretty' {
  const format = getEnv('LOG_FORMAT')?.toLowerCase()
  if (format === 'json' || format === 'pretty') {
    return format
  }
  // Browser always uses pretty, Node uses json in production
  if (isBrowser) {
    return 'pretty'
  }
  return getEnv('NODE_ENV') === 'production' ? 'json' : 'pretty'
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[getLogLevel()]
}

function formatError(error: unknown): LogEntry['error'] | undefined {
  if (!error) return undefined

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return {
    name: 'UnknownError',
    message: String(error),
  }
}

function formatJson(entry: LogEntry): string {
  // Apply redaction if enabled
  const finalEntry = isRedactionEnabled() ? redactEntry(entry) : entry
  if (isRedactionEnabled()) {
    metrics.redacted++
  }
  return JSON.stringify(finalEntry)
}

// ANSI colors for Node.js terminal
const ANSI_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m', // Green
  warn: '\x1b[33m', // Yellow
  error: '\x1b[31m', // Red
  fatal: '\x1b[35m', // Magenta
}

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const BRIGHT = '\x1b[1m'

// CSS colors for browser console
const CSS_COLORS: Record<LogLevel, string> = {
  debug: 'color: #00bcd4', // Cyan
  info: 'color: #4caf50', // Green
  warn: 'color: #ff9800', // Orange
  error: 'color: #f44336', // Red
  fatal: 'color: #9c27b0', // Purple
}

function formatPrettyNode(entry: LogEntry): string {
  const color = ANSI_COLORS[entry.level]
  const levelStr = entry.level.toUpperCase().padEnd(5)

  // Build component path
  const componentPath = entry.component
    ? `${entry.service}:${entry.component}`
    : entry.service

  // Extract known fields
  const { timestamp, level, service, component, message, error, ...meta } = entry

  // Format metadata
  const metaStr =
    Object.keys(meta).length > 0 ? ` ${DIM}${JSON.stringify(meta)}${RESET}` : ''

  // Format error
  const errorStr = error ? `\n  ${DIM}${error.stack || error.message}${RESET}` : ''

  return `${DIM}${timestamp}${RESET} ${color}${BRIGHT}${levelStr}${RESET} ${DIM}[${componentPath}]${RESET} ${message}${metaStr}${errorStr}`
}

function formatPrettyBrowser(entry: LogEntry): { message: string; styles: string[] } {
  const levelStr = entry.level.toUpperCase().padEnd(5)

  // Build component path
  const componentPath = entry.component
    ? `${entry.service}:${entry.component}`
    : entry.service

  // Extract known fields
  const { timestamp, level, service, component, message, error, ...meta } = entry

  // Format metadata
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''

  // Build message with %c placeholders for styling
  const formattedMessage = `%c${timestamp} %c${levelStr} %c[${componentPath}] %c${message}${metaStr}`
  const styles = [
    'color: #888', // timestamp
    CSS_COLORS[entry.level] + '; font-weight: bold', // level
    'color: #888', // component
    'color: inherit', // message
  ]

  return { message: formattedMessage, styles }
}

function enqueueAsync(line: string, level: LogLevel): void {
  asyncQueue.push({ line, level })
  if (!asyncFlushing) {
    asyncFlushing = true
    asyncFlushPromise = flushAsyncQueue()
  }
}

async function flushAsyncQueue(): Promise<void> {
  while (asyncQueue.length > 0) {
    const next = asyncQueue.shift()
    if (!next) continue
    const stream = next.level === 'error' || next.level === 'fatal'
      ? process.stderr
      : process.stdout
    if (!stream.write(`${next.line}\n`)) {
      await new Promise<void>((resolve) => stream.once('drain', resolve))
    }
  }
  asyncFlushing = false
}

export async function flushLogs(): Promise<void> {
  if (!isAsyncEnabled()) return
  if (asyncFlushing && asyncFlushPromise) {
    await asyncFlushPromise
  }
  if (asyncQueue.length > 0) {
    asyncFlushing = true
    asyncFlushPromise = flushAsyncQueue()
    await asyncFlushPromise
  }
}

function output(entry: LogEntry): void {
  // Update metrics
  metrics.total++
  metrics.byLevel[entry.level]++
  metrics.byService[entry.service] = (metrics.byService[entry.service] || 0) + 1

  const format = getLogFormat()

  if (!isBrowser && isAsyncEnabled()) {
    const line = format === 'json'
      ? formatJson(entry)
      : formatPrettyNode(entry)
    enqueueAsync(line, entry.level)
    return
  }

  if (format === 'json') {
    const formatted = formatJson(entry)
    switch (entry.level) {
      case 'debug':
        console.debug(formatted)
        break
      case 'info':
        console.info(formatted)
        break
      case 'warn':
        console.warn(formatted)
        break
      case 'error':
      case 'fatal':
        console.error(formatted)
        break
    }
    return
  }

  // Pretty format
  if (isBrowser) {
    const { message, styles } = formatPrettyBrowser(entry)
    switch (entry.level) {
      case 'debug':
        console.debug(message, ...styles)
        break
      case 'info':
        console.info(message, ...styles)
        break
      case 'warn':
        console.warn(message, ...styles)
        break
      case 'error':
      case 'fatal':
        console.error(message, ...styles)
        break
    }
    // Log error separately if present
    if (entry.error) {
      console.error(entry.error.stack || entry.error.message)
    }
  } else {
    const formatted = formatPrettyNode(entry)
    switch (entry.level) {
      case 'debug':
        console.debug(formatted)
        break
      case 'info':
        console.info(formatted)
        break
      case 'warn':
        console.warn(formatted)
        break
      case 'error':
      case 'fatal':
        console.error(formatted)
        break
    }
  }
}

export interface ILogger {
  debug(message: string, meta?: LogContext): void
  info(message: string, meta?: LogContext): void
  warn(message: string, meta?: LogContext, error?: unknown): void
  error(message: string, meta?: LogContext, error?: unknown): void
  fatal(message: string, meta?: LogContext, error?: unknown): void
  /**
   * Create a child logger
   * @param componentOrContext - Component name (string) or context object for backwards compatibility
   * @param defaultContext - Optional default context (only used when first arg is a string)
   */
  child(componentOrContext: string | LogContext, defaultContext?: LogContext): ILogger
}

export class Logger implements ILogger {
  private service: string
  private component?: string
  private defaultContext: LogContext

  constructor(service: string, component?: string, defaultContext: LogContext = {}) {
    this.service = service
    this.component = component
    this.defaultContext = defaultContext
  }

  private log(
    level: LogLevel,
    message: string,
    meta?: LogContext,
    error?: unknown
  ): void {
    if (!shouldLog(level)) return

    // Check sampling based on event_name
    const eventName = (meta?.event_name || meta?.event) as string | undefined
    if (!shouldSample(eventName)) {
      metrics.sampled++
      return
    }

    const errorData = error ? formatError(error) : undefined

    // Get request context from AsyncLocalStorage (if available)
    const requestContext = getRequestContext()

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      // Include request context fields (requestId, traceId, etc.) before other meta
      ...requestContext,
      ...this.defaultContext,
      ...meta,
    }

    if (this.component) {
      entry.component = this.component
    }

    if (errorData) {
      entry.error = errorData
    }

    output(entry)
  }

  debug(message: string, meta?: LogContext): void {
    this.log('debug', message, meta)
  }

  info(message: string, meta?: LogContext): void {
    this.log('info', message, meta)
  }

  warn(message: string, meta?: LogContext, error?: unknown): void {
    this.log('warn', message, meta, error)
  }

  error(message: string, meta?: LogContext, error?: unknown): void {
    this.log('error', message, meta, error)
  }

  fatal(message: string, meta?: LogContext, error?: unknown): void {
    this.log('fatal', message, meta, error)
  }

  child(componentOrContext: string | LogContext, defaultContext: LogContext = {}): ILogger {
    // Backwards compatibility: if first arg is object, treat as context
    if (typeof componentOrContext === 'object') {
      return new Logger(this.service, this.component, {
        ...this.defaultContext,
        ...componentOrContext,
      })
    }
    // New signature: first arg is component name string
    const newComponent = this.component
      ? `${this.component}:${componentOrContext}`
      : componentOrContext
    return new Logger(this.service, newComponent, {
      ...this.defaultContext,
      ...defaultContext,
    })
  }
}

/**
 * Create a logger for a service
 *
 * @param service - The service name (e.g., 'api', 'web', 'harvester')
 * @returns A logger instance
 *
 * @example
 * ```ts
 * import { createLogger } from '@ironscout/logger'
 *
 * const logger = createLogger('api')
 * logger.info('Server started', { port: 3000 })
 *
 * const authLogger = logger.child('auth')
 * authLogger.info('User logged in', { userId: '123' })
 * ```
 */
export function createLogger(service: string): ILogger {
  return new Logger(service)
}

/**
 * Generate a trace ID (simple UUID v4)
 */
export function generateTraceId(): string {
  // Simple UUID v4 generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Generate a span ID (shorter identifier for individual operations)
 */
export function generateSpanId(): string {
  return 'xxxxxxxxxxxxxxxx'.replace(/x/g, () => {
    return ((Math.random() * 16) | 0).toString(16)
  })
}
