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
import { getFeatures, initializeLicensing } from '../licensing';
import { validateLicenseKey, TIER_PRESETS, LicenseTier } from '../licensing/license';
import { requireAuth } from '../middleware/auth';
import { chatLimiter, apiLimiter } from '../middleware/rateLimit';
import { logger } from '../utils/logger';
import { db } from '../db/client';
import { agents } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { ensureDefaultAgent } from '../chat/chatService';
import { capabilityService } from '../capabilities';

// Ensure uploads directory exists
const IS_DESKTOP = process.env.IS_DESKTOP === 'true';
const dataDir = process.env.EXPERT_AGENT_DATA_DIR || process.cwd();
const uploadsPath = IS_DESKTOP ? path.join(dataDir, 'uploads') : path.join(__dirname, '../../uploads');
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
      version: '2.0.0-alpha.8',
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
  // Setup Endpoints (no auth — needed on first run before API_KEY exists)
  // ==========================================================================

  // Check whether initial setup is complete
  app.get('/api/setup/status', async (_req: Request, res: Response) => {
    try {
      // Check if a valid license key is present
      const licenseKey = process.env.AGENTICLEDGER_LICENSE_KEY;
      let hasLicense = false;
      if (licenseKey) {
        const licenseResult = validateLicenseKey(licenseKey);
        hasLicense = licenseResult.valid;
      }

      // Check if at least one agent exists
      const agentRows = await db.select().from(agents).limit(1);
      const hasAgent = agentRows.length > 0;

      // Check if that agent has at least one LLM API key configured
      let hasApiKey = false;
      if (hasAgent) {
        const agentId = agentRows[0].id as string;
        const keyStatus = await capabilityService.getAgentApiKeysStatus(agentId);
        hasApiKey = keyStatus.some((k) => k.configured || k.fromEnv);
      }

      const setupComplete = hasLicense && hasAgent && hasApiKey;

      res.json({ setupComplete, hasLicense, hasAgent, hasApiKey });
    } catch (err) {
      logger.error('Setup status check failed', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to check setup status' });
    }
  });

  // Validate a license key and save it to disk (for desktop setup wizard)
  app.post('/api/setup/validate-license', async (req: Request, res: Response) => {
    try {
      const { licenseKey } = req.body as { licenseKey?: string };

      if (!licenseKey || typeof licenseKey !== 'string' || licenseKey.trim() === '') {
        return res.status(400).json({ valid: false, error: 'License key is required' });
      }

      const result = validateLicenseKey(licenseKey.trim());

      if (!result.valid) {
        return res.json({ valid: false, error: result.error || 'Invalid license key' });
      }

      // Determine tier from features
      let detectedTier: string | undefined;
      const tiers: LicenseTier[] = ['enterprise', 'pro', 'starter'];
      for (const tier of tiers) {
        const preset = TIER_PRESETS[tier];
        const featureMatch = Object.keys(preset).every(
          (key) => JSON.stringify((result.features as any)[key]) === JSON.stringify((preset as any)[key])
        );
        if (featureMatch) {
          detectedTier = tier;
          break;
        }
      }

      // Save license key to data dir so it persists across restarts
      const dataDir = process.env.EXPERT_AGENT_DATA_DIR;
      if (dataDir) {
        const fsSync = require('fs');
        const pathMod = require('path');
        const licenseFilePath = pathMod.join(dataDir, 'license.key');
        try {
          fsSync.writeFileSync(licenseFilePath, licenseKey.trim(), 'utf-8');
          logger.info('License key saved to disk', { path: licenseFilePath });
        } catch (writeErr) {
          logger.warn('Failed to save license key to disk', { error: (writeErr as Error).message });
        }
      }

      // Re-initialize licensing with the new key
      process.env.AGENTICLEDGER_LICENSE_KEY = licenseKey.trim();
      initializeLicensing();

      res.json({
        valid: true,
        org: result.org,
        name: result.name,
        tier: detectedTier,
        expiresAt: result.expiresAt?.toISOString(),
        features: result.features,
      });
    } catch (err) {
      logger.error('License validation failed', { error: (err as Error).message });
      res.status(500).json({ valid: false, error: 'Failed to validate license key' });
    }
  });

  // Complete initial setup: create default agent + save API keys
  app.post('/api/setup/complete', async (req: Request, res: Response) => {
    try {
      const { agentName, agentDescription, anthropicApiKey, openaiApiKey } = req.body as {
        agentName: string;
        agentDescription?: string;
        anthropicApiKey?: string;
        openaiApiKey?: string;
      };

      if (!agentName || typeof agentName !== 'string') {
        return res.status(400).json({ error: 'agentName is required' });
      }

      if (!anthropicApiKey && !openaiApiKey) {
        return res.status(400).json({ error: 'At least one API key (anthropicApiKey or openaiApiKey) is required' });
      }

      // Create or get the default agent
      const agentId = await ensureDefaultAgent();

      // Update agent name/description if provided
      const patch: Record<string, string> = { name: agentName };
      if (agentDescription) {
        patch.description = agentDescription;
      }
      await db.update(agents).set(patch).where(eq(agents.id, agentId));

      // Save API keys using the same pattern as adminRoutes
      if (anthropicApiKey) {
        await capabilityService.setAgentApiKey(agentId, 'anthropic_api_key', anthropicApiKey);
      }
      if (openaiApiKey) {
        await capabilityService.setAgentApiKey(agentId, 'openai_api_key', openaiApiKey);
      }

      res.json({ success: true, agentId });
    } catch (err) {
      logger.error('Setup completion failed', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to complete setup' });
    }
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
