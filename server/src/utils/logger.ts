/**
 * Structured Logger
 *
 * Simple structured JSON logger wrapping console methods.
 * No new dependencies — just provides consistent, parseable log output.
 *
 * Usage:
 *   import { logger } from '../utils/logger';
 *   logger.info('Server started', { port: 4000 });
 *   logger.error('Request failed', { error: err.message, path: '/api/chat' });
 */

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(
      JSON.stringify({
        level: 'info',
        message,
        ...meta,
        timestamp: new Date().toISOString(),
      })
    );
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(
      JSON.stringify({
        level: 'warn',
        message,
        ...meta,
        timestamp: new Date().toISOString(),
      })
    );
  },

  error(message: string, meta?: Record<string, unknown>): void {
    console.error(
      JSON.stringify({
        level: 'error',
        message,
        ...meta,
        timestamp: new Date().toISOString(),
      })
    );
  },
};
