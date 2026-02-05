/**
 * QuickBooks Online OAuth Service for Agent-in-a-Box
 * Handles OAuth 2.0 flow for QuickBooks Online API access
 */

import OAuthClient from 'intuit-oauth';
import { db } from '../db/client';
import { capabilityTokens } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../utils/logger';

export interface QBOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: 'sandbox' | 'production';
}

export class QBOAuthService {
  private config: QBOAuthConfig;
  private oauthClient: OAuthClient;

  constructor(config: QBOAuthConfig) {
    this.config = config;
    this.oauthClient = new OAuthClient({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      environment: config.environment,
      redirectUri: config.redirectUri,
    });
    logger.info('QBO OAuth: Service initialized', { environment: config.environment });
  }

  /**
   * Generate authorization URL for QuickBooks OAuth
   */
  generateAuthUrl(state: string): string {
    const authUrl = this.oauthClient.authorizeUri({
      scope: [
        OAuthClient.scopes.Accounting,
        OAuthClient.scopes.OpenId,
        OAuthClient.scopes.Email,
      ],
      state: state,
    });

    logger.info('QBO OAuth: Generated auth URL', { stateLength: state.length });
    return authUrl;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(authorizationUrl: string): Promise<{
    accessToken: string;
    refreshToken: string;
    realmId: string;
    expiresIn: number;
  }> {
    try {
      logger.info('QBO OAuth: Exchanging authorization code for tokens');

      const authResponse = await this.oauthClient.createToken(authorizationUrl);
      const token = authResponse.token;

      if (!token.access_token) {
        throw new Error('No access token received from QuickBooks');
      }

      if (!token.refresh_token) {
        throw new Error('No refresh token received from QuickBooks');
      }

      const realmId = token.realmId;
      if (!realmId) {
        throw new Error('No realmId (company ID) received from QuickBooks');
      }

      logger.info('QBO OAuth: Token exchange successful', { realmId });

      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        realmId: realmId,
        expiresIn: token.expires_in || 3600,
      };
    } catch (error: any) {
      logger.error('QBO OAuth: Token exchange failed', { error: error.message });
      throw new Error(`QuickBooks OAuth token exchange failed: ${error.message}`);
    }
  }

  /**
   * Store tokens in the database
   * token1 = access_token
   * token2 = refresh_token
   * token3 = realm_id (company ID)
   */
  async storeTokens(
    agentId: string,
    capabilityId: string,
    accessToken: string,
    refreshToken: string,
    realmId: string,
    expiresIn: number = 3600
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Check if tokens already exist
    const existing = await db
      .select()
      .from(capabilityTokens)
      .where(
        and(
          eq(capabilityTokens.agentId, agentId),
          eq(capabilityTokens.capabilityId, capabilityId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing tokens
      await db
        .update(capabilityTokens)
        .set({
          token1: accessToken,
          token2: refreshToken,
          token3: realmId,
          expiresAt,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(capabilityTokens.agentId, agentId),
            eq(capabilityTokens.capabilityId, capabilityId)
          )
        );
      logger.info('QBO OAuth: Updated existing tokens', { agentId, capabilityId, realmId });
    } else {
      // Insert new tokens
      await db.insert(capabilityTokens).values({
        agentId,
        capabilityId,
        token1: accessToken,
        token2: refreshToken,
        token3: realmId,
        expiresAt,
      });
      logger.info('QBO OAuth: Stored new tokens', { agentId, capabilityId, realmId });
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidAccessToken(agentId: string, capabilityId: string): Promise<{
    accessToken: string;
    realmId: string;
  } | null> {
    const tokens = await db
      .select()
      .from(capabilityTokens)
      .where(
        and(
          eq(capabilityTokens.agentId, agentId),
          eq(capabilityTokens.capabilityId, capabilityId)
        )
      )
      .limit(1);

    if (tokens.length === 0 || !tokens[0].token1 || !tokens[0].token3) {
      return null;
    }

    const tokenData = tokens[0];
    const now = new Date();

    // Check if token is still valid (with 5 minute buffer)
    if (tokenData.expiresAt && now < new Date(tokenData.expiresAt.getTime() - 5 * 60 * 1000)) {
      return {
        accessToken: tokenData.token1,
        realmId: tokenData.token3,
      };
    }

    // Token expired, try to refresh
    if (tokenData.token2) {
      try {
        logger.info('QBO OAuth: Refreshing expired token', { agentId, capabilityId });

        this.oauthClient.token.setToken({
          access_token: tokenData.token1,
          refresh_token: tokenData.token2,
          realmId: tokenData.token3,
        });

        const authResponse = await this.oauthClient.refresh();
        const newToken = authResponse.token;

        if (!newToken?.access_token) {
          throw new Error('No access token received from refresh');
        }

        const newExpiresAt = new Date(Date.now() + (newToken.expires_in || 3600) * 1000);

        // Update stored tokens
        await db
          .update(capabilityTokens)
          .set({
            token1: newToken.access_token,
            token2: newToken.refresh_token || tokenData.token2, // Use new or keep old
            expiresAt: newExpiresAt,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(capabilityTokens.agentId, agentId),
              eq(capabilityTokens.capabilityId, capabilityId)
            )
          );

        logger.info('QBO OAuth: Token refreshed successfully', { agentId, capabilityId });
        return {
          accessToken: newToken.access_token,
          realmId: tokenData.token3,
        };
      } catch (error: any) {
        logger.error('QBO OAuth: Token refresh failed', { agentId, capabilityId, error: error.message });
        return null;
      }
    }

    return null;
  }

  /**
   * Get connection status
   */
  async getConnectionStatus(agentId: string, capabilityId: string): Promise<{
    connected: boolean;
    realmId?: string;
    expiresAt?: Date;
  }> {
    const tokens = await db
      .select()
      .from(capabilityTokens)
      .where(
        and(
          eq(capabilityTokens.agentId, agentId),
          eq(capabilityTokens.capabilityId, capabilityId)
        )
      )
      .limit(1);

    if (tokens.length === 0 || !tokens[0].token1) {
      return { connected: false };
    }

    return {
      connected: true,
      realmId: tokens[0].token3 || undefined,
      expiresAt: tokens[0].expiresAt || undefined,
    };
  }

  /**
   * Revoke access and delete tokens
   */
  async revokeAccess(agentId: string, capabilityId: string): Promise<void> {
    const tokens = await db
      .select()
      .from(capabilityTokens)
      .where(
        and(
          eq(capabilityTokens.agentId, agentId),
          eq(capabilityTokens.capabilityId, capabilityId)
        )
      )
      .limit(1);

    if (tokens.length > 0 && tokens[0].token1) {
      // Try to revoke with QuickBooks
      try {
        this.oauthClient.token.setToken({ access_token: tokens[0].token1 });
        await this.oauthClient.revoke();
        logger.info('QBO OAuth: Revoked credentials with QuickBooks', { agentId, capabilityId });
      } catch (error: any) {
        logger.warn('QBO OAuth: Failed to revoke with QuickBooks (continuing anyway)', { error: error.message });
      }
    }

    // Delete from database
    await db
      .delete(capabilityTokens)
      .where(
        and(
          eq(capabilityTokens.agentId, agentId),
          eq(capabilityTokens.capabilityId, capabilityId)
        )
      );

    logger.info('QBO OAuth: Deleted tokens from database', { agentId, capabilityId });
  }
}

// Singleton instance
let qboOAuthService: QBOAuthService | null = null;

export function initializeQBOAuth(config: QBOAuthConfig): void {
  qboOAuthService = new QBOAuthService(config);
  logger.info('QBO OAuth: Service initialized');
}

export function getQBOAuthService(): QBOAuthService | null {
  return qboOAuthService;
}
