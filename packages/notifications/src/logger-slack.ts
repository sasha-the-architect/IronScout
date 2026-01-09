import {
  sendSlackMessage,
  slackHeader,
  slackFieldsSection,
  slackContext,
  SLACK_CONFIG,
} from './channels/slack.js';

export type LogContext = Record<string, unknown>;

export interface ILogger {
  debug(message: string, meta?: LogContext): void;
  info(message: string, meta?: LogContext): void;
  warn(message: string, meta?: LogContext, error?: unknown): void;
  error(message: string, meta?: LogContext, error?: unknown): void;
  fatal(message: string, meta?: LogContext, error?: unknown): void;
  child(componentOrContext: string | LogContext, defaultContext?: LogContext): ILogger;
}

export interface SlackLoggerOptions {
  service: string;
  component?: string;
  webhookUrl?: string;
  metaLimit?: number;
}

const DEFAULT_META_LIMIT = 1200;

function safeStringifyMeta(meta?: LogContext, limit = DEFAULT_META_LIMIT): string | undefined {
  if (!meta || Object.keys(meta).length === 0) return undefined;
  try {
    const json = JSON.stringify(meta);
    return json.length > limit ? `${json.slice(0, limit)}...` : json;
  } catch {
    return 'unserializable meta';
  }
}

function formatErrorMessage(error?: unknown): string | undefined {
  if (!error) return undefined;
  if (error instanceof Error) return error.message;
  return String(error);
}

function notifySlackError(
  level: 'error' | 'fatal',
  message: string,
  meta: LogContext | undefined,
  error: unknown,
  options: SlackLoggerOptions
): void {
  const webhookUrl =
    options.webhookUrl
    ?? SLACK_CONFIG.datafeedAlertsWebhookUrl
    ?? SLACK_CONFIG.merchantOpsWebhookUrl;
  if (!webhookUrl) return;

  const metaText = safeStringifyMeta(meta, options.metaLimit);
  const errorMessage = formatErrorMessage(error);
  const fields: Record<string, string> = {
    Level: level.toUpperCase(),
    Service: options.service,
    Message: message,
  };

  if (options.component) {
    fields.Component = options.component;
  }
  if (errorMessage) {
    fields.Error = errorMessage;
  }
  if (metaText) {
    fields.Meta = `\`${metaText}\``;
  }

  void sendSlackMessage(
    {
      text: `${options.service} ${level.toUpperCase()}: ${message}`,
      blocks: [
        slackHeader(`${options.service} ${level.toUpperCase()}`),
        slackFieldsSection(fields),
        slackContext(
          `Service: ${options.service}${options.component ? ` | Component: ${options.component}` : ''}`
        ),
      ],
    },
    webhookUrl
  );
}

export function wrapLoggerWithSlack(base: ILogger, options: SlackLoggerOptions): ILogger {
  return {
    debug: (message, meta) => base.debug(message, meta),
    info: (message, meta) => base.info(message, meta),
    warn: (message, meta, error) => base.warn(message, meta, error),
    error: (message, meta, error) => {
      base.error(message, meta, error);
      notifySlackError('error', message, meta, error, options);
    },
    fatal: (message, meta, error) => {
      base.fatal(message, meta, error);
      notifySlackError('fatal', message, meta, error, options);
    },
    child: (componentOrContext, defaultContext) => {
      if (typeof componentOrContext === 'string') {
        const nextComponent = options.component
          ? `${options.component}:${componentOrContext}`
          : componentOrContext;
        return wrapLoggerWithSlack(
          base.child(componentOrContext, defaultContext),
          { ...options, component: nextComponent }
        );
      }
      return wrapLoggerWithSlack(base.child(componentOrContext), options);
    },
  };
}
