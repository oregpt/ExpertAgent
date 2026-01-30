/**
 * Microsoft Teams Channel Adapter
 *
 * Implements ChannelAdapter for Teams using Bot Framework REST API via axios.
 * NO botbuilder SDK dependency — raw REST API calls only.
 *
 * Handles:
 * - Sending messages via Bot Framework REST API
 * - Receiving messages (Bot Framework activity)
 * - OAuth access token caching (~1 hour expiry)
 *
 * Config shape (from DB):
 * {
 *   app_id: string,              // Azure AD App (client) ID
 *   app_password: string,        // Azure AD App secret
 *   default_conversation?: string,// Default conversation ID for proactive messages
 *   service_url?: string,        // Bot Framework service URL (set on first inbound)
 * }
 */

import axios from 'axios';
import { ChannelAdapter, ChannelMessage, InboundMessage } from '../types';
import { formatForTeams } from '../messageFormatter';

const TOKEN_URL = 'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token';
const BOT_FRAMEWORK_SCOPE = 'https://api.botframework.com/.default';

export class TeamsAdapter implements ChannelAdapter {
  readonly name = 'teams';

  private appId = '';
  private appPassword = '';
  private serviceUrl = '';

  // Token cache
  private accessToken = '';
  private tokenExpiresAt = 0; // Unix ms

  // --------------------------------------------------------------------------
  // Initialize
  // --------------------------------------------------------------------------

  async initialize(config: Record<string, any>): Promise<void> {
    this.appId = config.app_id || '';
    this.appPassword = config.app_password || '';
    this.serviceUrl = config.service_url || '';

    if (!this.appId || !this.appPassword) {
      console.warn('[teams] Missing app_id or app_password in config — sending will fail');
    }

    console.log('[teams] Adapter initialized');
  }

  // --------------------------------------------------------------------------
  // Access Token (OAuth2 Client Credentials)
  // --------------------------------------------------------------------------

  /**
   * Get a valid access token, refreshing if expired.
   * Caches the token in memory with expiry check.
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 5-minute buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 300_000) {
      return this.accessToken;
    }

    console.log('[teams] Fetching new access token...');

    try {
      const resp = await axios.post(
        TOKEN_URL,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.appId,
          client_secret: this.appPassword,
          scope: BOT_FRAMEWORK_SCOPE,
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      this.accessToken = resp.data.access_token;
      // expires_in is in seconds; convert to ms and add to current time
      this.tokenExpiresAt = Date.now() + (resp.data.expires_in || 3600) * 1000;

      console.log('[teams] Access token refreshed, expires in', resp.data.expires_in, 'seconds');
      return this.accessToken;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        console.error('[teams] Token refresh failed:', err.response?.status, err.response?.data);
      } else {
        console.error('[teams] Token refresh failed:', err);
      }
      throw new Error('Failed to get Teams access token');
    }
  }

  // --------------------------------------------------------------------------
  // Send Message
  // --------------------------------------------------------------------------

  async sendMessage(conversationId: string, message: ChannelMessage): Promise<void> {
    if (!this.appId || !this.appPassword) {
      throw new Error('Teams app_id/app_password not configured');
    }

    if (!this.serviceUrl) {
      throw new Error('Teams service_url not set (received on first inbound message)');
    }

    const token = await this.getAccessToken();
    const formattedText = formatForTeams(message.text);

    const url = `${this.serviceUrl}/v3/conversations/${encodeURIComponent(conversationId)}/activities`;

    try {
      const resp = await axios.post(
        url,
        {
          type: 'message',
          text: formattedText,
          textFormat: 'markdown',
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log(`[teams] Message sent to conversation ${conversationId}: id=${resp.data?.id}`);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        console.error('[teams] Send failed:', err.response?.status, err.response?.data);
      }
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // Handle Inbound (Bot Framework Activity)
  // --------------------------------------------------------------------------

  async handleInbound(req: any, res: any): Promise<InboundMessage | null> {
    const activity = req.body;

    // Respond immediately with 200 (process async)
    res.status(200).send();

    // Only handle message activities
    if (activity?.type !== 'message') {
      return null;
    }

    // Extract text (strip bot @mentions)
    let text = activity.text || '';
    // Teams sometimes wraps the mention in <at>BotName</at>
    text = text.replace(/<at>.*?<\/at>/gi, '').trim();

    if (!text) {
      return null;
    }

    // Capture the service URL for sending replies
    if (activity.serviceUrl && !this.serviceUrl) {
      this.serviceUrl = activity.serviceUrl.replace(/\/$/, '');
      console.log(`[teams] Service URL captured: ${this.serviceUrl}`);
    }

    const conversationId = activity.conversation?.id || '';
    const senderId = activity.from?.id || 'unknown';
    const senderName = (activity.from?.name || undefined) as string | undefined;

    const inbound: InboundMessage = {
      text,
      senderId,
      senderName,
      channelType: 'teams',
      channelId: '', // Will be set by route handler from DB lookup
      threadId: conversationId,
      metadata: {
        activityId: activity.id,
        conversationId,
        serviceUrl: activity.serviceUrl,
        replyChannelId: conversationId, // Reply back to same conversation
        tenantId: activity.channelData?.tenant?.id,
      },
    };

    return inbound;
  }

  // --------------------------------------------------------------------------
  // Shutdown
  // --------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    this.accessToken = '';
    this.tokenExpiresAt = 0;
    console.log('[teams] Adapter shut down');
  }
}
