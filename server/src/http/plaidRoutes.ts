/**
 * Plaid Link Flow Routes
 * 
 * Endpoints for Plaid Link integration:
 * - POST /api/plaid/link-token - Create link token for Plaid Link UI
 * - POST /api/plaid/exchange - Exchange public_token for access_token
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { capabilityService } from '../capabilities';

const router = Router();

// Plaid credentials from environment
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENVIRONMENT = process.env.PLAID_ENVIRONMENT || 'sandbox';

// Cache for link flow sessions (requestId -> credentials + expiry)
const plaidLinkCache = new Map<string, {
  clientId: string;
  secret: string;
  environment: string;
  agentId: string;
  expiresAt: number;
}>();

// Clean up expired sessions every minute
setInterval(() => {
  const now = Date.now();
  for (const [requestId, session] of plaidLinkCache.entries()) {
    if (session.expiresAt < now) {
      console.log(`[plaid] Cleaning up expired session ${requestId}`);
      plaidLinkCache.delete(requestId);
    }
  }
}, 60000);

/**
 * POST /api/plaid/link-token
 * Create a link token for Plaid Link UI
 */
router.post('/link-token', async (req: Request, res: Response) => {
  console.log('[plaid] /api/plaid/link-token endpoint hit');

  try {
    const { agentId } = req.body;
    
    if (!agentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: agentId'
      });
    }

    // Validate credentials
    if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
      console.error('[plaid] Missing PLAID_CLIENT_ID or PLAID_SECRET environment variables');
      return res.status(500).json({
        success: false,
        error: 'Plaid credentials not configured. Please set PLAID_CLIENT_ID and PLAID_SECRET environment variables.'
      });
    }

    // Validate environment
    if (!['sandbox', 'production'].includes(PLAID_ENVIRONMENT)) {
      return res.status(500).json({
        success: false,
        error: 'Invalid PLAID_ENVIRONMENT. Must be "sandbox" or "production"'
      });
    }

    // Import Plaid SDK
    const { PlaidApi, PlaidEnvironments, Configuration } = await import('plaid');

    console.log(`[plaid] Creating link_token for ${PLAID_ENVIRONMENT} environment`);

    // Configure Plaid client
    const configuration = new Configuration({
      basePath: PLAID_ENVIRONMENT === 'production'
        ? PlaidEnvironments.production
        : PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
          'PLAID-SECRET': PLAID_SECRET,
        },
      },
    });

    const plaidClient = new PlaidApi(configuration);

    // Create link_token
    const request = {
      user: {
        client_user_id: agentId,
      },
      client_name: 'Agent-in-a-Box',
      products: ['transactions'] as any,
      country_codes: ['US'] as any,
      language: 'en',
    };

    const response = await plaidClient.linkTokenCreate(request);
    const linkToken = response.data.link_token;

    // Generate unique request ID
    const requestId = crypto.randomBytes(32).toString('hex');

    // Cache credentials for 10 minutes
    const expiresAt = Date.now() + (10 * 60 * 1000);
    plaidLinkCache.set(requestId, {
      clientId: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      environment: PLAID_ENVIRONMENT,
      agentId,
      expiresAt
    });

    console.log(`[plaid] Link token created successfully, requestId: ${requestId}`);

    res.json({
      success: true,
      link_token: linkToken,
      requestId
    });

  } catch (error: any) {
    console.error('[plaid] Error creating link token:', error);

    const isPlaidError = error?.response?.data?.error_message;
    const errorMessage = isPlaidError
      ? `Plaid API error: ${error.response.data.error_message}`
      : error.message || 'Failed to create Plaid Link token';

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * POST /api/plaid/exchange
 * Exchange public_token for access_token and store it
 */
router.post('/exchange', async (req: Request, res: Response) => {
  console.log('[plaid] /api/plaid/exchange endpoint hit');

  try {
    const { requestId, public_token } = req.body;

    // Validate required fields
    if (!requestId || !public_token) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: requestId, public_token'
      });
    }

    // Retrieve cached credentials
    const cachedCredentials = plaidLinkCache.get(requestId.trim());

    if (!cachedCredentials) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired request. Please restart the Plaid Link flow.'
      });
    }

    // Import Plaid SDK
    const { PlaidApi, PlaidEnvironments, Configuration } = await import('plaid');

    console.log('[plaid] Exchanging public_token for access_token');

    // Configure Plaid client
    const configuration = new Configuration({
      basePath: cachedCredentials.environment === 'production'
        ? PlaidEnvironments.production
        : PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': cachedCredentials.clientId,
          'PLAID-SECRET': cachedCredentials.secret,
        },
      },
    });

    const plaidClient = new PlaidApi(configuration);

    // Exchange public_token for access_token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: public_token.trim()
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    console.log(`[plaid] Token exchange successful, item_id: ${itemId}`);

    // Store tokens in capability_tokens table
    // token1: client_id, token2: secret, token3: access_token
    await capabilityService.setCapabilityTokens(
      cachedCredentials.agentId,
      'plaid',
      {
        token1: cachedCredentials.clientId,
        token2: cachedCredentials.secret,
        token3: accessToken,
      }
    );

    // Clean up the cache entry
    plaidLinkCache.delete(requestId);

    console.log(`[plaid] Access token stored for agent ${cachedCredentials.agentId}`);

    res.json({
      success: true,
      message: 'Bank account connected successfully',
      item_id: itemId
    });

  } catch (error: any) {
    console.error('[plaid] Error exchanging token:', error);

    const isPlaidError = error?.response?.data?.error_message;
    const errorMessage = isPlaidError
      ? `Plaid API error: ${error.response.data.error_message}`
      : error.message || 'Failed to exchange Plaid token';

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * GET /api/plaid/status
 * Check if Plaid is configured
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    configured: !!(PLAID_CLIENT_ID && PLAID_SECRET),
    environment: PLAID_ENVIRONMENT
  });
});

export default router;
