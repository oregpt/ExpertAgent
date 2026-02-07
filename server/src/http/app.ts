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
import { getMCPServerManager } from '../mcp-hub';
import { capabilityService } from '../capabilities';
import { requireAuth } from '../middleware/auth';
import { chatLimiter, apiLimiter } from '../middleware/rateLimit';
import { logger } from '../utils/logger';
import { db } from '../db/client';
import { sql } from 'drizzle-orm';

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
      if (IS_DESKTOP) {
        // SQLite: drizzle better-sqlite3 doesn't support db.execute()
        const rawSqlite = require('../db/client-sqlite').rawSqlite;
        rawSqlite.prepare('SELECT 1').get();
      } else {
        await db.execute(sql`SELECT 1`);
      }
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
  app.get('/api/setup/status', (_req: Request, res: Response) => {
    try {
      // Check if a valid license key is present
      const licenseKey = process.env.AGENTICLEDGER_LICENSE_KEY;
      let hasLicense = false;
      if (licenseKey) {
        const licenseResult = validateLicenseKey(licenseKey);
        hasLicense = licenseResult.valid;
      }

      // Check if the setup-complete flag file exists (written by POST /api/setup/complete)
      const setupFlagPath = path.join(dataDir, 'setup-complete.flag');
      const hasCompletedSetup = fs.existsSync(setupFlagPath);

      const setupComplete = hasLicense && hasCompletedSetup;

      res.json({ setupComplete, hasLicense, hasCompletedSetup });
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

      // Initialize MCP Hub and capabilities now that license is active
      const updatedFeatures = getFeatures();
      if (updatedFeatures.mcpHub) {
        try {
          const manager = getMCPServerManager();
          await manager.initialize();
          await capabilityService.seedDefaultCapabilities();
          logger.info('MCP Hub and capabilities initialized after license activation');
        } catch (mcpErr) {
          logger.warn('Failed to initialize MCP Hub after license activation', { error: (mcpErr as Error).message });
        }
      }

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
      const {
        anthropicApiKey,
        openaiApiKey,
        grokApiKey,
        geminiApiKey,
      } = req.body as {
        anthropicApiKey?: string;
        openaiApiKey?: string;
        grokApiKey?: string;
        geminiApiKey?: string;
      };

      if (!anthropicApiKey && !openaiApiKey && !grokApiKey && !geminiApiKey) {
        return res.status(400).json({ error: 'At least one AI provider API key is required' });
      }

      // Save API keys to a platform-level config file (not per-agent)
      const platformConfig: Record<string, string> = {};
      if (anthropicApiKey) platformConfig.anthropic_api_key = anthropicApiKey;
      if (openaiApiKey) platformConfig.openai_api_key = openaiApiKey;
      if (grokApiKey) platformConfig.grok_api_key = grokApiKey;
      if (geminiApiKey) platformConfig.gemini_api_key = geminiApiKey;

      const configFilePath = path.join(dataDir, 'platform-api-keys.json');
      fs.writeFileSync(configFilePath, JSON.stringify(platformConfig, null, 2), 'utf-8');
      logger.info('Platform API keys saved', { path: configFilePath, keys: Object.keys(platformConfig) });

      // Mark setup as complete by writing a flag file
      const setupFlagPath = path.join(dataDir, 'setup-complete.flag');
      fs.writeFileSync(setupFlagPath, new Date().toISOString(), 'utf-8');

      res.json({ success: true });
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
