import pino from 'pino';

const isJsonFormat =
  process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';

const baseLogger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { service: 'node-b2b-orders' },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  ...(isJsonFormat
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
});

export type LogExtra = Record<string, unknown> & { correlationId?: string; tenantId?: string };

/**
 * Creates a logger for use outside HTTP context (e.g. worker).
 * Pass correlationId and tenantId in extra when available.
 */
export function getLogger(name: string) {
  return baseLogger.child({ context: name });
}

/**
 * Log helper for worker - outputs structured JSON in production.
 * @param msg - Log message
 * @param extra - Optional extra fields (correlationId, tenantId, etc.)
 */
export function log(msg: string, extra?: LogExtra): void {
  const bindings: LogExtra = { correlationId: '', tenantId: '', ...extra };
  baseLogger.info(bindings, msg);
}
