/**
 * OAuth Routes for Agent-in-a-Box
 * Handles OAuth flows for Google and QuickBooks
 */

import { Router, Request, Response } from 'express';
import { getGoogleOAuthService, initializeGoogleOAuth, GOOGLE_SCOPES } from '../services/googleOAuth';
import { getQBOAuthService, initializeQBOAuth } from '../services/qboOAuth';
import { requireAuth } from '../middleware/auth';
import { logger } from '../utils/logger';

export const oauthRouter = Router();

// ============================================================================
// Initialize OAuth Services
// ============================================================================

// Initialize Google OAuth if credentials are available
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

if (googleClientId && googleClientSecret) {
  initializeGoogleOAuth({
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    redirectUri: `${baseUrl}/api/auth/google/callback`,
  });
  logger.info('Google OAuth: Initialized from environment');
} else {
  logger.warn('Google OAuth: Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
}

// Initialize QuickBooks OAuth if credentials are available
const qboClientId = process.env.QBO_CLIENT_ID;
const qboClientSecret = process.env.QBO_CLIENT_SECRET;
const qboEnvironment = (process.env.QBO_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';

if (qboClientId && qboClientSecret) {
  initializeQBOAuth({
    clientId: qboClientId,
    clientSecret: qboClientSecret,
    redirectUri: `${baseUrl}/api/auth/qbo/callback`,
    environment: qboEnvironment,
  });
  logger.info('QBO OAuth: Initialized from environment', { environment: qboEnvironment });
} else {
  logger.warn('QBO OAuth: Missing QBO_CLIENT_ID or QBO_CLIENT_SECRET');
}

// ============================================================================
// Google OAuth Routes
// ============================================================================

/**
 * GET /api/auth/google/start
 * Initiate Google OAuth flow
 * Query params: agentId, capabilityId (optional, defaults to 'google-oauth')
 */
oauthRouter.get('/google/start', requireAuth, async (req: Request, res: Response) => {
  try {
    const service = getGoogleOAuthService();
    if (!service) {
      return res.status(500).json({ error: 'Google OAuth not configured' });
    }

    const { agentId, capabilityId = 'google-oauth' } = req.query;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }

    // Determine scopes based on capability
    let scopes = GOOGLE_SCOPES.all;
    if (capabilityId === 'gmail-mcp') {
      scopes = GOOGLE_SCOPES.gmail;
    } else if (capabilityId === 'google-calendar-mcp') {
      scopes = GOOGLE_SCOPES.calendar;
    } else if (capabilityId === 'google-docs-mcp') {
      scopes = GOOGLE_SCOPES.docs;
    } else if (capabilityId === 'google-sheets-mcp') {
      scopes = GOOGLE_SCOPES.sheets;
    }

    // Create state object for callback
    const state = JSON.stringify({
      agentId,
      capabilityId,
    });

    const authUrl = service.generateAuthUrl(state, scopes);
    res.json({ authUrl });
  } catch (error) {
    logger.error('Google OAuth: Error starting flow', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to start Google OAuth flow' });
  }
});

/**
 * GET /api/auth/google/callback
 * Handle Google OAuth callback
 */
oauthRouter.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const service = getGoogleOAuthService();
    if (!service) {
      return res.redirect('/?error=' + encodeURIComponent('Google OAuth not configured'));
    }

    const { code, state } = req.query;

    if (!code || !state) {
      return res.redirect('/?error=' + encodeURIComponent('Missing authorization code or state'));
    }

    // Parse state
    let stateData: { agentId: string; capabilityId: string };
    try {
      stateData = JSON.parse(state as string);
    } catch {
      return res.redirect('/?error=' + encodeURIComponent('Invalid state parameter'));
    }

    const { agentId, capabilityId } = stateData;

    // Exchange code for tokens
    const tokenResult = await service.exchangeCodeForTokens(code as string);

    // Store tokens
    await service.storeTokens(
      agentId,
      capabilityId,
      tokenResult.accessToken,
      tokenResult.refreshToken,
      tokenResult.email,
      tokenResult.expiresIn
    );

    logger.info('Google OAuth: Successfully connected', { agentId, capabilityId, email: tokenResult.email });

    // Redirect with success
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google Connected</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 50px; background: #0f172a; color: #e5e7eb; }
            h1 { color: #22c55e; }
          </style>
        </head>
        <body>
          <h1>✓ Google Connected!</h1>
          <p>Account: ${tokenResult.email || 'Unknown'}</p>
          <p>You can close this window now.</p>
          <script>
            setTimeout(() => { window.close(); }, 2000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    logger.error('Google OAuth: Callback error', { error: (error as Error).message });
    res.redirect('/?error=' + encodeURIComponent('OAuth callback failed: ' + (error as Error).message));
  }
});

/**
 * GET /api/auth/google/status
 * Check Google OAuth connection status
 * Query params: agentId, capabilityId
 */
oauthRouter.get('/google/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const service = getGoogleOAuthService();
    if (!service) {
      return res.json({ connected: false, message: 'Google OAuth not configured' });
    }

    const { agentId, capabilityId = 'google-oauth' } = req.query;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }

    const status = await service.getConnectionStatus(agentId as string, capabilityId as string);
    res.json(status);
  } catch (error) {
    logger.error('Google OAuth: Status check error', { error: (error as Error).message });
    res.json({ connected: false });
  }
});

/**
 * DELETE /api/auth/google
 * Revoke Google OAuth access
 * Query params: agentId, capabilityId
 */
oauthRouter.delete('/google', requireAuth, async (req: Request, res: Response) => {
  try {
    const service = getGoogleOAuthService();
    if (!service) {
      return res.status(500).json({ error: 'Google OAuth not configured' });
    }

    const { agentId, capabilityId = 'google-oauth' } = req.query;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }

    await service.revokeAccess(agentId as string, capabilityId as string);
    res.json({ success: true, message: 'Google OAuth access revoked' });
  } catch (error) {
    logger.error('Google OAuth: Revoke error', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to revoke Google OAuth access' });
  }
});

// ============================================================================
// QuickBooks OAuth Routes
// ============================================================================

/**
 * GET /api/auth/qbo/start
 * Initiate QuickBooks OAuth flow
 * Query params: agentId, capabilityId (optional, defaults to 'qbo-mcp')
 */
oauthRouter.get('/qbo/start', requireAuth, async (req: Request, res: Response) => {
  try {
    const service = getQBOAuthService();
    if (!service) {
      return res.status(500).json({ error: 'QuickBooks OAuth not configured' });
    }

    const { agentId, capabilityId = 'qbo-mcp' } = req.query;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }

    // Create state object for callback
    const state = JSON.stringify({
      agentId,
      capabilityId,
    });

    const authUrl = service.generateAuthUrl(state);
    res.json({ authUrl });
  } catch (error) {
    logger.error('QBO OAuth: Error starting flow', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to start QuickBooks OAuth flow' });
  }
});

/**
 * GET /api/auth/qbo/callback
 * Handle QuickBooks OAuth callback
 */
oauthRouter.get('/qbo/callback', async (req: Request, res: Response) => {
  try {
    const service = getQBOAuthService();
    if (!service) {
      return res.redirect('/?error=' + encodeURIComponent('QuickBooks OAuth not configured'));
    }

    const { state, realmId } = req.query;

    if (!state) {
      return res.redirect('/?error=' + encodeURIComponent('Missing state parameter'));
    }

    // Parse state
    let stateData: { agentId: string; capabilityId: string };
    try {
      stateData = JSON.parse(state as string);
    } catch {
      return res.redirect('/?error=' + encodeURIComponent('Invalid state parameter'));
    }

    const { agentId, capabilityId } = stateData;

    // Exchange code for tokens - QuickBooks sends the full URL
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const tokenResult = await service.exchangeCodeForTokens(fullUrl);

    // Store tokens
    await service.storeTokens(
      agentId,
      capabilityId,
      tokenResult.accessToken,
      tokenResult.refreshToken,
      tokenResult.realmId,
      tokenResult.expiresIn
    );

    logger.info('QBO OAuth: Successfully connected', { agentId, capabilityId, realmId: tokenResult.realmId });

    // Redirect with success
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QuickBooks Connected</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 50px; background: #0f172a; color: #e5e7eb; }
            h1 { color: #22c55e; }
          </style>
        </head>
        <body>
          <h1>✓ QuickBooks Connected!</h1>
          <p>Company ID: ${tokenResult.realmId}</p>
          <p>You can close this window now.</p>
          <script>
            setTimeout(() => { window.close(); }, 2000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    logger.error('QBO OAuth: Callback error', { error: (error as Error).message });
    res.redirect('/?error=' + encodeURIComponent('OAuth callback failed: ' + (error as Error).message));
  }
});

/**
 * GET /api/auth/qbo/status
 * Check QuickBooks OAuth connection status
 * Query params: agentId, capabilityId
 */
oauthRouter.get('/qbo/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const service = getQBOAuthService();
    if (!service) {
      return res.json({ connected: false, message: 'QuickBooks OAuth not configured' });
    }

    const { agentId, capabilityId = 'qbo-mcp' } = req.query;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }

    const status = await service.getConnectionStatus(agentId as string, capabilityId as string);
    res.json(status);
  } catch (error) {
    logger.error('QBO OAuth: Status check error', { error: (error as Error).message });
    res.json({ connected: false });
  }
});

/**
 * DELETE /api/auth/qbo
 * Revoke QuickBooks OAuth access
 * Query params: agentId, capabilityId
 */
oauthRouter.delete('/qbo', requireAuth, async (req: Request, res: Response) => {
  try {
    const service = getQBOAuthService();
    if (!service) {
      return res.status(500).json({ error: 'QuickBooks OAuth not configured' });
    }

    const { agentId, capabilityId = 'qbo-mcp' } = req.query;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }

    await service.revokeAccess(agentId as string, capabilityId as string);
    res.json({ success: true, message: 'QuickBooks OAuth access revoked' });
  } catch (error) {
    logger.error('QBO OAuth: Revoke error', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to revoke QuickBooks OAuth access' });
  }
});
