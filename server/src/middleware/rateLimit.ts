/**
 * Rate Limiting Middleware
 *
 * Two limiters:
 * - chatLimiter: 60 requests per minute per IP (for chat endpoints)
 * - apiLimiter: 120 requests per minute per IP (for admin/API endpoints)
 */

import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for chat endpoints.
 * 60 requests per minute per IP.
 */
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,  // Disable `X-RateLimit-*` headers
  message: {
    error: 'Too many requests',
    message: 'Chat rate limit exceeded. Please try again in a moment.',
    retryAfterSeconds: 60,
  },
});

/**
 * Rate limiter for admin/API endpoints.
 * 120 requests per minute per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'API rate limit exceeded. Please try again in a moment.',
    retryAfterSeconds: 60,
  },
});
