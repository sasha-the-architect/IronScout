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
 * - LOG_ASYNC: Enable async buffered logging (true/1). Default: false
 * - NODE_ENV: Used to determine defaults
 *
 * Browser behavior:
 * - Uses 'pretty' format with CSS colors in dev tools
 * - LOG_LEVEL defaults to 'info' (can be overridden via localStorage)
 * - Request context features are no-ops (AsyncLocalStorage not available)
 */
// Detect environment
const isBrowser = typeof window !== 'undefined';
const isNode = typeof process !== 'undefined' && process.versions?.node;
// AsyncLocalStorage for request-scoped context (Node.js only)
// We use dynamic require to avoid bundling async_hooks in browser builds
let requestContextStorage;
if (isNode && !isBrowser) {
    // Node.js environment - use real AsyncLocalStorage
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const asyncHooks = require('async_hooks');
        const storage = new asyncHooks.AsyncLocalStorage();
        requestContextStorage = {
            run: (context, fn) => storage.run(context, fn),
            getStore: () => storage.getStore(),
        };
    }
    catch {
        // Fallback if async_hooks not available
        requestContextStorage = {
            run: (_context, fn) => fn(),
            getStore: () => undefined,
        };
    }
}
else {
    // Browser environment - no-op implementation
    requestContextStorage = {
        run: (_context, fn) => fn(),
        getStore: () => undefined,
    };
}
/**
 * Run a function with request context
 * All log entries within the callback will include the context fields
 * Note: This is a no-op in browser environments
 */
export function withRequestContext(context, fn) {
    return requestContextStorage.run(context, fn);
}
/**
 * Get the current request context (if any)
 * Note: Always returns undefined in browser environments
 */
export function getRequestContext() {
    return requestContextStorage.getStore();
}
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
};
// Dynamic log level support - allows runtime changes without restart
let dynamicLogLevel = null;
function isAsyncEnabled() {
    if (!isNode || isBrowser)
        return false;
    const flag = getEnv('LOG_ASYNC');
    return flag === 'true' || flag === '1';
}
const asyncQueue = [];
let asyncFlushPromise = null;
let asyncFlushing = false;
/**
 * Set the log level dynamically at runtime
 * This takes precedence over LOG_LEVEL env var
 * @param level - The log level to set
 */
export function setLogLevel(level) {
    if (LOG_LEVELS[level] !== undefined) {
        dynamicLogLevel = level;
    }
}
/**
 * Get the current effective log level
 */
export function getCurrentLogLevel() {
    return getLogLevel();
}
// Safe environment variable access
function getEnv(key) {
    if (isNode && typeof process !== 'undefined' && process.env) {
        return process.env[key];
    }
    if (isBrowser && typeof localStorage !== 'undefined') {
        try {
            return localStorage.getItem(key) ?? undefined;
        }
        catch {
            return undefined;
        }
    }
    return undefined;
}
function getLogLevel() {
    // Check dynamic level first (set via setLogLevel())
    if (dynamicLogLevel !== null) {
        return dynamicLogLevel;
    }
    // Fall back to env var
    const level = getEnv('LOG_LEVEL')?.toLowerCase();
    if (level && LOG_LEVELS[level] !== undefined) {
        return level;
    }
    return 'info';
}
function getLogFormat() {
    const format = getEnv('LOG_FORMAT')?.toLowerCase();
    if (format === 'json' || format === 'pretty') {
        return format;
    }
    // Browser always uses pretty, Node uses json in production
    if (isBrowser) {
        return 'pretty';
    }
    return getEnv('NODE_ENV') === 'production' ? 'json' : 'pretty';
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
// ANSI colors for Node.js terminal
const ANSI_COLORS = {
    debug: '\x1b[36m', // Cyan
    info: '\x1b[32m', // Green
    warn: '\x1b[33m', // Yellow
    error: '\x1b[31m', // Red
    fatal: '\x1b[35m', // Magenta
};
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BRIGHT = '\x1b[1m';
// CSS colors for browser console
const CSS_COLORS = {
    debug: 'color: #00bcd4', // Cyan
    info: 'color: #4caf50', // Green
    warn: 'color: #ff9800', // Orange
    error: 'color: #f44336', // Red
    fatal: 'color: #9c27b0', // Purple
};
function formatPrettyNode(entry) {
    const color = ANSI_COLORS[entry.level];
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
function formatPrettyBrowser(entry) {
    const levelStr = entry.level.toUpperCase().padEnd(5);
    // Build component path
    const componentPath = entry.component
        ? `${entry.service}:${entry.component}`
        : entry.service;
    // Extract known fields
    const { timestamp, level, service, component, message, error, ...meta } = entry;
    // Format metadata
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    // Build message with %c placeholders for styling
    const formattedMessage = `%c${timestamp} %c${levelStr} %c[${componentPath}] %c${message}${metaStr}`;
    const styles = [
        'color: #888', // timestamp
        CSS_COLORS[entry.level] + '; font-weight: bold', // level
        'color: #888', // component
        'color: inherit', // message
    ];
    return { message: formattedMessage, styles };
}
function enqueueAsync(line, level) {
    asyncQueue.push({ line, level });
    if (!asyncFlushing) {
        asyncFlushing = true;
        asyncFlushPromise = flushAsyncQueue();
    }
}
async function flushAsyncQueue() {
    while (asyncQueue.length > 0) {
        const next = asyncQueue.shift();
        if (!next)
            continue;
        const stream = next.level === 'error' || next.level === 'fatal'
            ? process.stderr
            : process.stdout;
        if (!stream.write(`${next.line}\n`)) {
            await new Promise((resolve) => stream.once('drain', resolve));
        }
    }
    asyncFlushing = false;
}
export async function flushLogs() {
    if (!isAsyncEnabled())
        return;
    if (asyncFlushing && asyncFlushPromise) {
        await asyncFlushPromise;
    }
    if (asyncQueue.length > 0) {
        asyncFlushing = true;
        asyncFlushPromise = flushAsyncQueue();
        await asyncFlushPromise;
    }
}
function output(entry) {
    const format = getLogFormat();
    if (!isBrowser && isAsyncEnabled()) {
        const line = format === 'json'
            ? formatJson(entry)
            : formatPrettyNode(entry);
        enqueueAsync(line, entry.level);
        return;
    }
    if (format === 'json') {
        const formatted = formatJson(entry);
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
        return;
    }
    // Pretty format
    if (isBrowser) {
        const { message, styles } = formatPrettyBrowser(entry);
        switch (entry.level) {
            case 'debug':
                console.debug(message, ...styles);
                break;
            case 'info':
                console.info(message, ...styles);
                break;
            case 'warn':
                console.warn(message, ...styles);
                break;
            case 'error':
            case 'fatal':
                console.error(message, ...styles);
                break;
        }
        // Log error separately if present
        if (entry.error) {
            console.error(entry.error.stack || entry.error.message);
        }
    }
    else {
        const formatted = formatPrettyNode(entry);
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
        // Get request context from AsyncLocalStorage (if available)
        const requestContext = getRequestContext();
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            service: this.service,
            message,
            // Include request context fields (requestId, etc.) before other meta
            ...requestContext,
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