/**
 * @ironscout/logger
 *
 * Structured logging for all IronScout applications.
 *
 * Features:
 * - JSON-formatted output for production (machine-parseable)
 * - Colored output for development (human-readable)
 * - ISO 8601 timestamps
 * - Log levels: debug, info, warn, error, fatal
 * - Structured metadata support
 * - Child loggers with inherited context
 * - Environment-based configuration
 *
 * Environment variables:
 * - LOG_LEVEL: Minimum log level (debug, info, warn, error, fatal). Default: info
 * - LOG_FORMAT: Output format (json, pretty). Default: json in production, pretty in development
 * - NODE_ENV: Used to determine defaults
 */
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
};
const LOG_COLORS = {
    debug: '\x1b[36m', // Cyan
    info: '\x1b[32m', // Green
    warn: '\x1b[33m', // Yellow
    error: '\x1b[31m', // Red
    fatal: '\x1b[35m', // Magenta
};
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BRIGHT = '\x1b[1m';
function getLogLevel() {
    const level = process.env.LOG_LEVEL?.toLowerCase();
    if (level && LOG_LEVELS[level] !== undefined) {
        return level;
    }
    return 'info';
}
function getLogFormat() {
    const format = process.env.LOG_FORMAT?.toLowerCase();
    if (format === 'json' || format === 'pretty') {
        return format;
    }
    // Default: pretty in development, json in production
    return process.env.NODE_ENV === 'production' ? 'json' : 'pretty';
}
function shouldLog(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[getLogLevel()];
}
function formatError(error) {
    if (!error)
        return undefined;
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }
    return {
        name: 'UnknownError',
        message: String(error),
    };
}
function formatJson(entry) {
    return JSON.stringify(entry);
}
function formatPretty(entry) {
    const color = LOG_COLORS[entry.level];
    const levelStr = entry.level.toUpperCase().padEnd(5);
    // Build component path
    const componentPath = entry.component
        ? `${entry.service}:${entry.component}`
        : entry.service;
    // Extract known fields
    const { timestamp, level, service, component, message, error, ...meta } = entry;
    // Format metadata
    const metaStr = Object.keys(meta).length > 0 ? ` ${DIM}${JSON.stringify(meta)}${RESET}` : '';
    // Format error
    const errorStr = error ? `\n  ${DIM}${error.stack || error.message}${RESET}` : '';
    return `${DIM}${timestamp}${RESET} ${color}${BRIGHT}${levelStr}${RESET} ${DIM}[${componentPath}]${RESET} ${message}${metaStr}${errorStr}`;
}
function output(entry) {
    const format = getLogFormat();
    const formatted = format === 'json' ? formatJson(entry) : formatPretty(entry);
    switch (entry.level) {
        case 'debug':
            console.debug(formatted);
            break;
        case 'info':
            console.info(formatted);
            break;
        case 'warn':
            console.warn(formatted);
            break;
        case 'error':
        case 'fatal':
            console.error(formatted);
            break;
    }
}
export class Logger {
    service;
    component;
    defaultContext;
    constructor(service, component, defaultContext = {}) {
        this.service = service;
        this.component = component;
        this.defaultContext = defaultContext;
    }
    log(level, message, meta, error) {
        if (!shouldLog(level))
            return;
        const errorData = error ? formatError(error) : undefined;
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            service: this.service,
            message,
            ...this.defaultContext,
            ...meta,
        };
        if (this.component) {
            entry.component = this.component;
        }
        if (errorData) {
            entry.error = errorData;
        }
        output(entry);
    }
    debug(message, meta) {
        this.log('debug', message, meta);
    }
    info(message, meta) {
        this.log('info', message, meta);
    }
    warn(message, meta, error) {
        this.log('warn', message, meta, error);
    }
    error(message, meta, error) {
        this.log('error', message, meta, error);
    }
    fatal(message, meta, error) {
        this.log('fatal', message, meta, error);
    }
    child(componentOrContext, defaultContext = {}) {
        // Backwards compatibility: if first arg is object, treat as context
        if (typeof componentOrContext === 'object') {
            return new Logger(this.service, this.component, {
                ...this.defaultContext,
                ...componentOrContext,
            });
        }
        // New signature: first arg is component name string
        const newComponent = this.component
            ? `${this.component}:${componentOrContext}`
            : componentOrContext;
        return new Logger(this.service, newComponent, {
            ...this.defaultContext,
            ...defaultContext,
        });
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
export function createLogger(service) {
    return new Logger(service);
}
//# sourceMappingURL=index.js.map