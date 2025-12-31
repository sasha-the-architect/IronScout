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
 * - Request ID correlation via AsyncLocalStorage (Node.js only)
 *
 * Environment variables (Node.js only):
 * - LOG_LEVEL: Minimum log level (debug, info, warn, error, fatal). Default: info
 * - LOG_FORMAT: Output format (json, pretty). Default: json in production, pretty in development
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
//# sourceMappingURL=index.d.ts.map