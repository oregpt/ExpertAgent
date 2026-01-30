/**
 * Input Validation Middleware
 *
 * Uses Zod (already a dependency) for request body validation.
 * Exports a `validate(schema)` middleware factory and pre-built schemas.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// ============================================================================
// Validation Middleware Factory
// ============================================================================

/**
 * Returns Express middleware that validates req.body against the given Zod schema.
 * On failure, responds with 400 and detailed error info.
 */
export function validate(schema: z.ZodType<any, any, any>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
      return;
    }

    // Replace body with parsed (coerced/stripped) data
    req.body = result.data;
    next();
  };
}

// ============================================================================
// Schemas
// ============================================================================

/** Chat message body */
export const chatMessageSchema = z.object({
  message: z.string().min(1, 'Message is required').max(10000, 'Message too long (max 10000 chars)'),
});

/** Document update body (memory routes) */
export const documentUpdateSchema = z.object({
  content: z.string().max(500000, 'Content too long (max 500000 chars)'),
  docType: z.string().optional(),
});

/** Memory search body */
export const memorySearchSchema = z.object({
  query: z.string().min(1, 'Query is required').max(1000, 'Query too long (max 1000 chars)'),
  topK: z.number().int().min(1).max(20).optional(),
});

/** Channel create body */
export const channelCreateSchema = z.object({
  channel_type: z.enum(['slack', 'teams', 'webhook'], {
    errorMap: () => ({ message: "channel_type must be 'slack', 'teams', or 'webhook'" }),
  }),
  channel_name: z.string().optional(),
  config: z.record(z.unknown(), { required_error: 'config object is required' }),
});

/** Cron job create body */
export const cronJobCreateSchema = z.object({
  schedule: z.string().min(1, 'Schedule is required'),
  taskText: z.string().min(1, 'Task text is required').max(5000, 'Task text too long (max 5000 chars)'),
  model: z.string().optional(),
  enabled: z.boolean().optional(),
});

/** Heartbeat config body */
export const heartbeatConfigSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.number().int().min(1).max(1440).optional(),
  checklist: z.string().nullable().optional(),
  quietHoursStart: z.string().nullable().optional(),
  quietHoursEnd: z.string().nullable().optional(),
  timezone: z.string().optional(),
});
