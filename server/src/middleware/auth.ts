/**
 * Authentication Middleware
 *
 * API key authentication for admin routes.
 * Checks `X-API-Key` header or `api_key` query parameter against the
 * configured API_KEY environment variable.
 *
 * If API_KEY is not set, auth is disabled (dev mode) with a startup warning.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  logger.warn('API_KEY not set — admin routes are UNAUTHENTICATED (dev mode)');
}

/**
 * Middleware that requires a valid API key.
 * Apply to all admin routes (admin, memory, proactive, channel, kb, rag).
 * Do NOT apply to chat routes or channel webhook endpoints.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // If no API_KEY configured, auth is disabled (dev mode)
  if (!API_KEY) {
    next();
    return;
  }

  // Check X-API-Key header first, then api_key query param
  const providedKey =
    (req.headers['x-api-key'] as string) ||
    (req.query.api_key as string);

  if (!providedKey) {
    res.status(401).json({
      error: 'Authentication required',
      message: 'Provide API key via X-API-Key header or api_key query parameter',
    });
    return;
  }

  if (providedKey !== API_KEY) {
    logger.warn('Invalid API key attempt', { path: req.path, ip: req.ip });
    res.status(403).json({
      error: 'Invalid API key',
    });
    return;
  }

  next();
}
