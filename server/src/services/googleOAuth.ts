/**
 * Google OAuth Service for Agent-in-a-Box
 * Handles OAuth 2.0 flow for Google services (Gmail, Calendar, Docs, Sheets)
 */

import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { db } from '../db/client';
import { capabilityTokens } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { dbNow, toDbDate } from '../db/date-utils';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

// Google OAuth scopes for different capabilities
export const GOOGLE_SCOPES = {
  gmail: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.labels',
  ],
  calendar: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ],
  docs: [
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/drive',
  ],
  sheets: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
  ],
  all: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets',
  ],
};

export class GoogleOAuthService {
  private config: GoogleOAuthConfig;
  private oauth2Client: OAuth2Client;

  constructor(config: GoogleOAuthConfig) {
    this.config = config;
    this.oauth2Client = new OAuth2Client(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );
  }

  /**
   * Generate authorization URL for Google OAuth
   */
  generateAuthUrl(state: string, scopes: string[] = GOOGLE_SCOPES.all): string {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['email', 'profile', ...scopes],
      prompt: 'consent', // Force consent to get refresh token
      state: state,
    });

    logger.info('Google OAuth: Generated auth URL', { stateLength: state.length });
    return authUrl;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    email?: string;
  }> {
    try {
      logger.info('Google OAuth: Exchanging code for tokens');

      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new Error('No access token received from Google');
      }

      // Get user email
      this.oauth2Client.setCredentials({ access_token: tokens.access_token });
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      const email = userInfo.data.email || undefined;

      logger.info('Google OAuth: Token exchange successful', { email });

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        expiresIn: tokens.expiry_date
          ? Math.floor((tokens.expiry_date - Date.now()) / 1000)
          : 3600,
        email,
      };
    } catch (error: any) {
      logger.error('Google OAuth: Token exchange failed', { error: error.message });
      throw new Error(`OAuth token exchange failed: ${error.message}`);
    }
  }

  /**
   * Store tokens in the database
   */
  async storeTokens(
    agentId: string,
    capabilityId: string,
    accessToken: string,
    refreshToken?: string,
    email?: string,
    expiresIn: number = 3600
  ): Promise<void> {
    const expiresAt = toDbDate(new Date(Date.now() + expiresIn * 1000));

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

    const existingRow = existing[0];
    if (existingRow) {
      // Update existing tokens
      await db
        .update(capabilityTokens)
        .set({
          token1: accessToken,
          token2: refreshToken || existingRow.token2, // Keep old refresh if no new one
          token3: email,
          expiresAt,
          updatedAt: dbNow(),
        })
        .where(
          and(
            eq(capabilityTokens.agentId, agentId),
            eq(capabilityTokens.capabilityId, capabilityId)
          )
        );
      logger.info('Google OAuth: Updated existing tokens', { agentId, capabilityId });
    } else {
      // Insert new tokens
      await db.insert(capabilityTokens).values({
        agentId,
        capabilityId,
        token1: accessToken,
        token2: refreshToken,
        token3: email,
        expiresAt,
      });
      logger.info('Google OAuth: Stored new tokens', { agentId, capabilityId });
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidAccessToken(agentId: string, capabilityId: string): Promise<string | null> {
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

    const tokenData = tokens[0];
    if (!tokenData || !tokenData.token1) {
      return null;
    }

    const now = new Date();

    // Check if token is still valid (with 5 minute buffer)
    if (tokenData.expiresAt && now < new Date(tokenData.expiresAt.getTime() - 5 * 60 * 1000)) {
      return tokenData.token1;
    }

    // Token expired, try to refresh
    if (tokenData.token2) {
      try {
        logger.info('Google OAuth: Refreshing expired token', { agentId, capabilityId });

        this.oauth2Client.setCredentials({ refresh_token: tokenData.token2 });
        const { credentials } = await this.oauth2Client.refreshAccessToken();

        if (!credentials.access_token) {
          throw new Error('No access token received from refresh');
        }

        const newExpiresAt = toDbDate(new Date(credentials.expiry_date || Date.now() + 3600000));

        // Update stored tokens
        await db
          .update(capabilityTokens)
          .set({
            token1: credentials.access_token,
            expiresAt: newExpiresAt,
            updatedAt: dbNow(),
          })
          .where(
            and(
              eq(capabilityTokens.agentId, agentId),
              eq(capabilityTokens.capabilityId, capabilityId)
            )
          );

        logger.info('Google OAuth: Token refreshed successfully', { agentId, capabilityId });
        return credentials.access_token;
      } catch (error: any) {
        logger.error('Google OAuth: Token refresh failed', { agentId, capabilityId, error: error.message });
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
    email?: string;
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

    const tokenData = tokens[0];
    if (!tokenData || !tokenData.token1) {
      return { connected: false };
    }

    return {
      connected: true,
      email: tokenData.token3 || undefined,
      expiresAt: tokenData.expiresAt || undefined,
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

    const tokenData2 = tokens[0];
    if (tokenData2 && tokenData2.token1) {
      // Try to revoke with Google
      try {
        this.oauth2Client.setCredentials({ access_token: tokenData2.token1 });
        await this.oauth2Client.revokeCredentials();
        logger.info('Google OAuth: Revoked credentials with Google', { agentId, capabilityId });
      } catch (error: any) {
        logger.warn('Google OAuth: Failed to revoke with Google (continuing anyway)', { error: error.message });
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

    logger.info('Google OAuth: Deleted tokens from database', { agentId, capabilityId });
  }

  /**
   * Test the connection by calling a Google API
   */
  async testConnection(accessToken: string): Promise<{ success: boolean; error?: string; email?: string }> {
    try {
      this.oauth2Client.setCredentials({ access_token: accessToken });
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const userInfo = await oauth2.userinfo.get();

      return {
        success: true,
        email: userInfo.data.email || undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Singleton instance
let googleOAuthService: GoogleOAuthService | null = null;

export function initializeGoogleOAuth(config: GoogleOAuthConfig): void {
  googleOAuthService = new GoogleOAuthService(config);
  logger.info('Google OAuth: Service initialized');
}

export function getGoogleOAuthService(): GoogleOAuthService | null {
  return googleOAuthService;
}
