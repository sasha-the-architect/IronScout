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
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
/**
 * Request context for correlation across log entries
 */
export interface RequestContext {
    requestId?: string;
    traceId?: string;
    spanId?: string;
    userId?: string;
    [key: string]: unknown;
}
/**
 * Run a function with request context
 * All log entries within the callback will include the context fields
 * Note: This is a no-op in browser environments
 */
export declare function withRequestContext<T>(context: RequestContext, fn: () => T): T;
/**
 * Get the current request context (if any)
 * Note: Always returns undefined in browser environments
 */
export declare function getRequestContext(): RequestContext | undefined;
export interface LogContext {
    [key: string]: unknown;
}
/**
 * Configure sampling rate for an event type
 * @param eventName - Event name or pattern (e.g., 'http.request.end')
 * @param rate - Sample rate from 0.0 (log nothing) to 1.0 (log everything)
 */
export declare function setSampleRate(eventName: string, rate: number): void;
/**
 * Set default sample rate for events without specific config
 */
export declare function setDefaultSampleRate(rate: number): void;
interface LogMetrics {
    total: number;
    byLevel: Record<LogLevel, number>;
    byService: Record<string, number>;
    sampled: number;
    redacted: number;
    lastReset: number;
}
/**
 * Get current log metrics
 */
export declare function getLogMetrics(): LogMetrics & {
    uptimeMs: number;
};
/**
 * Reset log metrics
 */
export declare function resetLogMetrics(): void;
/**
 * Enable or disable redaction at runtime
 */
export declare function setRedactionEnabled(enabled: boolean): void;
/**
 * Set the log level dynamically at runtime
 * This takes precedence over LOG_LEVEL env var
 * @param level - The log level to set
 */
export declare function setLogLevel(level: LogLevel): void;
/**
 * Get the current effective log level
 */
export declare function getCurrentLogLevel(): LogLevel;
export declare function flushLogs(): Promise<void>;
export interface ILogger {
    debug(message: string, meta?: LogContext): void;
    info(message: string, meta?: LogContext): void;
    warn(message: string, meta?: LogContext, error?: unknown): void;
    error(message: string, meta?: LogContext, error?: unknown): void;
    fatal(message: string, meta?: LogContext, error?: unknown): void;
    /**
     * Create a child logger
     * @param componentOrContext - Component name (string) or context object for backwards compatibility
     * @param defaultContext - Optional default context (only used when first arg is a string)
     */
    child(componentOrContext: string | LogContext, defaultContext?: LogContext): ILogger;
}
export declare class Logger implements ILogger {
    private service;
    private component?;
    private defaultContext;
    constructor(service: string, component?: string, defaultContext?: LogContext);
    private log;
    debug(message: string, meta?: LogContext): void;
    info(message: string, meta?: LogContext): void;
    warn(message: string, meta?: LogContext, error?: unknown): void;
    error(message: string, meta?: LogContext, error?: unknown): void;
    fatal(message: string, meta?: LogContext, error?: unknown): void;
    child(componentOrContext: string | LogContext, defaultContext?: LogContext): ILogger;
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
export declare function createLogger(service: string): ILogger;
/**
 * Generate a trace ID (simple UUID v4)
 */
export declare function generateTraceId(): string;
/**
 * Generate a span ID (shorter identifier for individual operations)
 */
export declare function generateSpanId(): string;
export {};
//# sourceMappingURL=index.d.ts.map