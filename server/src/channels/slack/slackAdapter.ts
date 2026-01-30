/**
 * Slack Channel Adapter
 *
 * Implements ChannelAdapter for Slack using the Web API via axios.
 * NO @slack/bolt dependency — raw REST API calls only.
 *
 * Handles:
 * - Sending messages via chat.postMessage
 * - Receiving messages via Events API (message events)
 * - URL verification challenge
 * - Request signature verification (HMAC-SHA256)
 *
 * Config shape (from DB):
 * {
 *   bot_token: string,        // xoxb-...
 *   signing_secret: string,   // Slack app signing secret
 *   default_channel?: string, // Default channel to send proactive messages
 *   bot_user_id?: string,     // Bot's own user ID (to filter self-messages)
 * }
 */

import crypto from 'crypto';
import axios from 'axios';
import { ChannelAdapter, ChannelMessage, InboundMessage } from '../types';
import { formatForSlack } from '../messageFormatter';

const SLACK_API_BASE = 'https://slack.com/api';

export class SlackAdapter implements ChannelAdapter {
  readonly name = 'slack';

  private botToken = '';
  private signingSecret = '';
  private botUserId = '';

  // --------------------------------------------------------------------------
  // Initialize
  // --------------------------------------------------------------------------

  async initialize(config: Record<string, any>): Promise<void> {
    this.botToken = config.bot_token || '';
    this.signingSecret = config.signing_secret || '';
    this.botUserId = config.bot_user_id || '';

    if (!this.botToken) {
      console.warn('[slack] No bot_token in config — sending will fail');
    }
    if (!this.signingSecret) {
      console.warn('[slack] No signing_secret in config — webhook verification disabled');
    }

    // If we have a token but no bot_user_id, try to fetch it
    if (this.botToken && !this.botUserId) {
      try {
        const resp = await axios.get(`${SLACK_API_BASE}/auth.test`, {
          headers: { Authorization: `Bearer ${this.botToken}` },
        });
        if (resp.data?.ok && resp.data.user_id) {
          this.botUserId = resp.data.user_id;
          console.log(`[slack] Bot user ID resolved: ${this.botUserId}`);
        }
      } catch (err) {
        console.warn('[slack] Could not resolve bot user ID:', err);
      }
    }

    console.log('[slack] Adapter initialized');
  }

  // --------------------------------------------------------------------------
  // Send Message
  // --------------------------------------------------------------------------

  async sendMessage(channelId: string, message: ChannelMessage): Promise<void> {
    if (!this.botToken) {
      throw new Error('Slack bot_token not configured');
    }

    const formattedText = formatForSlack(message.text);

    try {
      const resp = await axios.post(
        `${SLACK_API_BASE}/chat.postMessage`,
        {
          channel: channelId,
          text: formattedText,
          // Optionally add thread_ts from metadata for threaded replies
          ...(message.metadata?.thread_ts ? { thread_ts: message.metadata.thread_ts } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${this.botToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!resp.data?.ok) {
        console.error(`[slack] chat.postMessage failed: ${resp.data?.error || 'unknown error'}`);
        throw new Error(`Slack API error: ${resp.data?.error}`);
      }

      console.log(`[slack] Message sent to ${channelId}: ts=${resp.data.ts}`);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        console.error(`[slack] HTTP error sending message:`, err.response?.status, err.response?.data);
      }
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // Handle Inbound (Events API)
  // --------------------------------------------------------------------------

  async handleInbound(req: any, res: any): Promise<InboundMessage | null> {
    const body = req.body;

    // 1. URL Verification Challenge
    //    Slack sends this when you first configure the Events API URL.
    if (body?.type === 'url_verification') {
      console.log('[slack] URL verification challenge received');
      res.status(200).json({ challenge: body.challenge });
      return null;
    }

    // 2. Respond immediately with 200 (Slack requires < 3s response)
    res.status(200).send('ok');

    // 3. Handle event_callback (actual message events)
    if (body?.type !== 'event_callback' || !body.event) {
      return null;
    }

    const event = body.event;

    // Only handle message events (not subtypes like message_changed, etc.)
    if (event.type !== 'message' || event.subtype) {
      return null;
    }

    // Filter bot's own messages to avoid infinite loops
    if (event.bot_id || event.user === this.botUserId) {
      return null;
    }

    // Filter empty messages
    if (!event.text || event.text.trim() === '') {
      return null;
    }

    const inbound: InboundMessage = {
      text: event.text,
      senderId: event.user || 'unknown',
      senderName: (event.user_profile?.display_name || event.user_profile?.real_name || undefined) as string | undefined,
      channelType: 'slack',
      channelId: '', // Will be set by the route handler from DB lookup
      threadId: event.thread_ts || event.ts,
      metadata: {
        slackChannel: event.channel,
        ts: event.ts,
        thread_ts: event.thread_ts || event.ts,
        team: body.team_id,
        replyChannelId: event.channel, // Reply back to the same Slack channel
      },
    };

    return inbound;
  }

  // --------------------------------------------------------------------------
  // Webhook Signature Verification
  // --------------------------------------------------------------------------

  /**
   * Verify Slack request signature.
   * Uses HMAC-SHA256 with the signing secret to validate that the
   * request actually came from Slack.
   *
   * See: https://api.slack.com/authentication/verifying-requests-from-slack
   */
  verifyWebhook(req: any): boolean {
    if (!this.signingSecret) {
      console.warn('[slack] No signing_secret configured — skipping verification');
      return true; // Allow if not configured (dev mode)
    }

    const timestamp = req.headers['x-slack-request-timestamp'];
    const slackSignature = req.headers['x-slack-signature'];

    if (!timestamp || !slackSignature) {
      console.warn('[slack] Missing signature headers');
      return false;
    }

    // Prevent replay attacks — reject if timestamp is more than 5 minutes old
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
      console.warn('[slack] Request timestamp too old (possible replay attack)');
      return false;
    }

    // Compute expected signature
    // The raw body must be available (Express needs to expose it)
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const sigBaseString = `v0:${timestamp}:${rawBody}`;

    const expectedSignature =
      'v0=' +
      crypto
        .createHmac('sha256', this.signingSecret)
        .update(sigBaseString, 'utf8')
        .digest('hex');

    // Constant-time comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'utf8'),
        Buffer.from(slackSignature, 'utf8')
      );
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Shutdown
  // --------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    console.log('[slack] Adapter shut down');
  }
}
