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
import { getMCPServerManager } from '../mcp-hub/mcp-server-manager';

const router = Router();

// Helper function to get Plaid credentials at request time (not module load time)
// This ensures dotenv has already loaded the .env file
function getPlaidCredentials() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const environment = process.env.PLAID_ENVIRONMENT || 'sandbox';
  
  console.log(`[plaid] Reading credentials at request time - client_id: ${clientId ? 'SET (' + clientId.substring(0, 8) + '...)' : 'NOT SET'}, secret: ${secret ? 'SET (' + secret.substring(0, 8) + '...)' : 'NOT SET'}, environment: ${environment}`);
  
  return { clientId, secret, environment };
}

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

    // Get credentials at request time (ensures dotenv has loaded)
    const { clientId, secret, environment } = getPlaidCredentials();

    // Validate credentials
    if (!clientId || !secret) {
      console.error('[plaid] Missing PLAID_CLIENT_ID or PLAID_SECRET environment variables');
      return res.status(500).json({
        success: false,
        error: 'Plaid credentials not configured. Please set PLAID_CLIENT_ID and PLAID_SECRET environment variables.'
      });
    }

    // Validate environment
    if (!['sandbox', 'production'].includes(environment)) {
      return res.status(500).json({
        success: false,
        error: 'Invalid PLAID_ENVIRONMENT. Must be "sandbox" or "production"'
      });
    }

    // Import Plaid SDK
    const { PlaidApi, PlaidEnvironments, Configuration } = await import('plaid');

    console.log(`[plaid] Creating link_token for ${environment} environment`);

    // Configure Plaid client
    const configuration = new Configuration({
      basePath: environment === 'production'
        ? PlaidEnvironments.production
        : PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': clientId,
          'PLAID-SECRET': secret,
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
      clientId: clientId,
      secret: secret,
      environment: environment,
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
    console.log(`[plaid] Storing tokens - token1 (client_id): ${cachedCredentials.clientId ? 'SET (' + cachedCredentials.clientId.substring(0, 8) + '...)' : 'NOT SET'}`);
    console.log(`[plaid] Storing tokens - token2 (secret): ${cachedCredentials.secret ? 'SET (' + cachedCredentials.secret.substring(0, 8) + '...)' : 'NOT SET'}`);
    console.log(`[plaid] Storing tokens - token3 (access_token): ${accessToken ? 'SET (' + accessToken.substring(0, 8) + '...)' : 'NOT SET'}`);
    
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

    console.log(`[plaid] All 3 tokens stored successfully for agent ${cachedCredentials.agentId}`);

    // Live reload: Configure the Plaid MCP server with the new tokens
    try {
      const manager = getMCPServerManager();
      manager.configureBundledServerTokens('plaid', {
        token1: cachedCredentials.clientId,
        token2: cachedCredentials.secret,
        token3: accessToken,
      });
      console.log('[plaid] Live reload: Plaid MCP server configured with new tokens');
    } catch (reloadErr) {
      console.warn('[plaid] Live reload failed (server will need restart):', reloadErr);
    }

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
  const { clientId, secret, environment } = getPlaidCredentials();
  res.json({
    configured: !!(clientId && secret),
    environment: environment
  });
});

export default router;
