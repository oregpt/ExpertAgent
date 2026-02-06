import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { chatRouter } from './chatRoutes';
import { capabilityRouter } from './capabilityRoutes';
import { kbRouter } from './kbRoutes';
import { ragRouter } from './ragRoutes';
import { adminRouter } from './adminRoutes';
import { memoryRouter } from './memoryRoutes';
import { proactiveRouter } from './proactiveRoutes';
import { channelRoutes } from './channelRoutes';
import { oauthRouter } from './oauthRoutes';
import plaidRoutes from './plaidRoutes';
import { getFeatures } from '../licensing';
import { requireAuth } from '../middleware/auth';
import { chatLimiter, apiLimiter } from '../middleware/rateLimit';
import { logger } from '../utils/logger';
import { db } from '../db/client';
import { sql } from 'drizzle-orm';

// Ensure uploads directory exists
const uploadsPath = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
  logger.info('Created uploads directory', { path: uploadsPath });
}

export function createHttpApp() {
  const app = express();

  // ==========================================================================
  // 6.5: Security Headers (no helmet — avoid new deps)
  // ==========================================================================

  // Remove X-Powered-By header
  app.disable('x-powered-by');

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // ==========================================================================
  // 6.4: CORS Configuration
  // ==========================================================================

  const corsOrigins = process.env.CORS_ORIGINS;
  app.use(
    cors({
      origin: corsOrigins
        ? corsOrigins.split(',').map((o) => o.trim())
        : '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    })
  );

  // ==========================================================================
  // Body Parsing
  // ==========================================================================

  // Parse JSON and capture raw body (needed for Slack/webhook signature verification)
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        // Store raw body for HMAC signature verification (Slack, webhooks)
        req.rawBody = buf.toString('utf8');
      },
    })
  );

  // Serve uploaded files statically
  app.use('/uploads', express.static(uploadsPath));

  // ==========================================================================
  // 6.7: Health Check (no auth required)
  // ==========================================================================

  app.get('/health', async (_req: Request, res: Response) => {
    const healthData: Record<string, unknown> = {
      status: 'ok',
      version: '2.0.0-alpha.1',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };

    try {
      await db.execute(sql`SELECT 1`);
      healthData.db = 'connected';
    } catch {
      healthData.status = 'degraded';
      healthData.db = 'disconnected';
    }

    const statusCode = healthData.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(healthData);
  });

  // Public endpoint: Widget features (what the embeddable widget can do)
  // This is NOT the admin licensing endpoint - it exposes only what the widget needs
  app.get('/api/widget/features', (_req: Request, res: Response) => {
    const features = getFeatures();
    res.json({
      multimodal: features.multimodal,
      customBranding: features.customBranding,
      mcpHub: features.mcpHub,
      soulMemory: features.soulMemory,
    });
  });

  // ==========================================================================
  // Routes with Auth & Rate Limiting
  // ==========================================================================

  // Chat routes: public (widget uses these), chat rate limited, NO auth
  app.use('/api/chat', chatLimiter, chatRouter);

  // Admin routes: require auth + API rate limiter
  app.use('/api/capabilities', apiLimiter, requireAuth, capabilityRouter);
  app.use('/api/kb', apiLimiter, requireAuth, kbRouter);
  app.use('/api/rag', apiLimiter, requireAuth, ragRouter);
  app.use('/api/admin', apiLimiter, requireAuth, adminRouter);

  // OAuth routes: mounted at /api/auth. Auth applied INSIDE router per-route.
  // Callback routes are unauthenticated (user returns from OAuth provider).
  app.use('/api/auth', apiLimiter, oauthRouter);

  // Plaid Link flow routes
  app.use('/api/plaid', apiLimiter, plaidRoutes);

  // v2 routes: mounted at /api. Auth is applied INSIDE each router.
  // This is because channelRoutes has both auth'd CRUD routes and
  // unauthenticated webhook endpoints (they verify signatures themselves).
  // memoryRouter and proactiveRouter apply requireAuth as router-level middleware.
  app.use('/api', apiLimiter, memoryRouter);      // Auth inside router (all routes)
  app.use('/api', apiLimiter, proactiveRouter);    // Auth inside router (all routes)
  app.use('/api', apiLimiter, channelRoutes);      // Auth on CRUD routes, webhooks use own verification

  // In production, serve the frontend static files
  if (process.env.NODE_ENV === 'production') {
    const publicPath = path.join(__dirname, '../../public');
    app.use(express.static(publicPath));

    // SPA fallback - serve index.html for all non-API routes
    // Note: Express 5 / path-to-regexp 8+ requires '{*path}' syntax instead of '*'
    app.get('/{*path}', (_req: Request, res: Response) => {
      res.sendFile(path.join(publicPath, 'index.html'));
    });
  }

  // ==========================================================================
  // 6.9: Global Error Handler (must be LAST middleware)
  // ==========================================================================

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const isProduction = process.env.NODE_ENV === 'production';

    logger.error('Unhandled error', {
      error: err.message,
      stack: isProduction ? undefined : err.stack,
      path: req.path,
      method: req.method,
    });

    // Never expose stack traces in production
    res.status(err.status || 500).json({
      error: isProduction ? 'Internal server error' : err.message || 'Internal server error',
    });
  });

  return app;
}
