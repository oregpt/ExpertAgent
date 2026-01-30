/**
 * Generic Webhook Channel Adapter
 *
 * Implements ChannelAdapter for generic HTTP webhooks.
 * Any system can integrate by:
 * - Receiving outbound: POST to callback_url with JSON payload + HMAC signature
 * - Sending inbound: POST to /api/channels/webhook/:agentId with { text, senderId, senderName? }
 *
 * Config shape (from DB):
 * {
 *   callback_url: string,   // URL to POST outbound messages to
 *   secret?: string,        // Shared secret for HMAC-SHA256 signing (outbound + inbound verification)
 * }
 */

import crypto from 'crypto';
import axios from 'axios';
import { ChannelAdapter, ChannelMessage, InboundMessage } from '../types';
import { formatForWebhook } from '../messageFormatter';

export class WebhookAdapter implements ChannelAdapter {
  readonly name = 'webhook';

  private callbackUrl = '';
  private secret = '';

  // --------------------------------------------------------------------------
  // Initialize
  // --------------------------------------------------------------------------

  async initialize(config: Record<string, any>): Promise<void> {
    this.callbackUrl = config.callback_url || '';
    this.secret = config.secret || '';

    if (!this.callbackUrl) {
      console.warn('[webhook] No callback_url in config — outbound will fail');
    }

    console.log('[webhook] Adapter initialized');
  }

  // --------------------------------------------------------------------------
  // Send Message
  // --------------------------------------------------------------------------

  async sendMessage(channelId: string, message: ChannelMessage): Promise<void> {
    // channelId for webhooks is the callback_url (or we use the configured one)
    const targetUrl = channelId || this.callbackUrl;
    if (!targetUrl) {
      throw new Error('Webhook callback_url not configured');
    }

    const formattedText = formatForWebhook(message.text);

    const payload = JSON.stringify({
      text: formattedText,
      agentId: message.agentId,
      conversationId: message.conversationId || null,
      timestamp: new Date().toISOString(),
      metadata: message.metadata || {},
    });

    // Build headers with optional HMAC signature
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.secret) {
      const signature = crypto
        .createHmac('sha256', this.secret)
        .update(payload, 'utf8')
        .digest('hex');
      headers['X-Webhook-Signature'] = signature;
    }

    try {
      await axios.post(targetUrl, payload, {
        headers,
        timeout: 10_000, // 10s timeout for outbound webhooks
      });
      console.log(`[webhook] Message sent to ${targetUrl}: len=${formattedText.length}`);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        console.error(`[webhook] Send failed to ${targetUrl}:`, err.response?.status, err.message);
      }
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // Handle Inbound
  // --------------------------------------------------------------------------

  async handleInbound(req: any, res: any): Promise<InboundMessage | null> {
    const body = req.body;

    // Respond immediately
    res.status(200).json({ ok: true });

    // Validate required fields
    if (!body?.text || typeof body.text !== 'string') {
      console.warn('[webhook] Inbound missing text field');
      return null;
    }

    const senderId = body.senderId || body.sender_id || 'webhook-anonymous';
    const senderName = body.senderName || body.sender_name || undefined;

    const inbound: InboundMessage = {
      text: body.text,
      senderId: String(senderId),
      senderName: senderName ? String(senderName) : undefined,
      channelType: 'webhook',
      channelId: '', // Will be set by route handler
      threadId: body.threadId || body.thread_id || undefined,
      metadata: {
        ...(body.metadata || {}),
        replyChannelId: this.callbackUrl || undefined,
      },
    };

    return inbound;
  }

  // --------------------------------------------------------------------------
  // Verify Webhook (HMAC Signature)
  // --------------------------------------------------------------------------

  /**
   * Verify inbound webhook HMAC signature.
   * Checks X-Webhook-Signature header against HMAC-SHA256 of raw body.
   */
  verifyWebhook(req: any): boolean {
    if (!this.secret) {
      // No secret configured — allow all (useful for development)
      return true;
    }

    const signature = req.headers['x-webhook-signature'];
    if (!signature) {
      console.warn('[webhook] Missing X-Webhook-Signature header');
      return false;
    }

    // Compute expected signature from raw body
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', this.secret)
      .update(rawBody, 'utf8')
      .digest('hex');

    // Constant-time comparison
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'utf8'),
        Buffer.from(signature, 'utf8')
      );
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Shutdown
  // --------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    console.log('[webhook] Adapter shut down');
  }
}
