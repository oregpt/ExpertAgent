/**
 * Channel Router
 *
 * The central hub for all multi-channel message routing.
 * Routes inbound messages from any channel → agent (via chatService).
 * Routes outbound messages from agent → correct channel adapter.
 *
 * Singleton — initialized once on server startup.
 * All sends/receives are logged.
 */

import { ChannelAdapter, ChannelMessage, InboundMessage, AgentChannelRow } from './types';
import { formatForChannel } from './messageFormatter';
import { db } from '../db/client';
import { agentChannels } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { generateReply, startConversation, appendMessage } from '../chat/chatService';
import { logger } from '../utils/logger';
import { decryptChannelConfig } from '../utils/encryption';

// ============================================================================
// Channel Router
// ============================================================================

class ChannelRouter {
  /** Registered adapters by channel type name */
  private adapters = new Map<string, ChannelAdapter>();

  /** Initialized channel configs from DB (keyed by `${channelType}:${channelDbId}`) */
  private initializedChannels = new Set<string>();

  // --------------------------------------------------------------------------
  // Adapter Registration
  // --------------------------------------------------------------------------

  /**
   * Register a channel adapter. Call once per adapter type (slack, teams, webhook).
   */
  registerAdapter(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.name, adapter);
    logger.info('Channel adapter registered', { adapter: adapter.name });
  }

  /**
   * Get a registered adapter by name.
   */
  getAdapter(channelType: string): ChannelAdapter | undefined {
    return this.adapters.get(channelType);
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  /**
   * Load all agent channel configs from DB and initialize their adapters.
   * Called on server startup.
   */
  async initializeAll(): Promise<void> {
    logger.info('Initializing all channel configs from DB');

    try {
      const rows = await db
        .select()
        .from(agentChannels)
        .where(eq(agentChannels.enabled, true)) as any[];

      let initialized = 0;
      for (const row of rows) {
        const channelRow = row as AgentChannelRow;
        try {
          await this.initializeChannel(channelRow);
          initialized++;
        } catch (err) {
          logger.error('Failed to initialize channel', {
            channelId: channelRow.id,
            channelType: channelRow.channelType,
            error: (err as Error).message,
          });
        }
      }

      logger.info('Channels initialized', { initialized, total: rows.length });
    } catch (err) {
      logger.error('Failed to load channels from DB', { error: (err as Error).message });
    }
  }

  /**
   * Initialize a single channel config with its adapter.
   * Decrypts sensitive config fields before passing to the adapter.
   */
  private async initializeChannel(channelRow: AgentChannelRow): Promise<void> {
    const adapter = this.adapters.get(channelRow.channelType);
    if (!adapter) {
      console.warn(
        `[channels] No adapter registered for type "${channelRow.channelType}" (channel ${channelRow.id})`
      );
      return;
    }

    const key = `${channelRow.channelType}:${channelRow.id}`;
    if (this.initializedChannels.has(key)) {
      return; // Already initialized
    }

    // Decrypt sensitive fields before passing to the adapter
    const decryptedConfig = decryptChannelConfig(channelRow.config || {});
    await adapter.initialize(decryptedConfig);
    this.initializedChannels.add(key);

    logger.info('Channel initialized', {
      channelType: channelRow.channelType,
      channelName: channelRow.channelName || String(channelRow.id),
      agentId: channelRow.agentId,
    });
  }

  // --------------------------------------------------------------------------
  // Outbound: Agent → Channel
  // --------------------------------------------------------------------------

  /**
   * Send a message through a specific channel adapter.
   * Formats the message text for the target channel.
   *
   * @param channelType — 'slack', 'teams', 'webhook'
   * @param channelId — platform-specific target (Slack channel, Teams conversation, etc.)
   * @param message — the message to send
   */
  async sendMessage(channelType: string, channelId: string, message: ChannelMessage): Promise<void> {
    const adapter = this.adapters.get(channelType);
    if (!adapter) {
      logger.error('No adapter for channel type — cannot send', { channelType });
      return;
    }

    // Format the text for the target channel
    const formattedMessage: ChannelMessage = {
      ...message,
      text: formatForChannel(message.text, channelType),
    };

    try {
      await adapter.sendMessage(channelId, formattedMessage);
      logger.info('Channel message sent', {
        channelType,
        channelId,
        agentId: message.agentId,
        textLength: message.text.length,
      });
    } catch (err) {
      logger.error('Channel send failed', { channelType, channelId, error: (err as Error).message });
      throw err;
    }
  }

  /**
   * Send a message to ALL enabled channels for an agent.
   * Used by the proactive engine to broadcast alerts.
   */
  async sendToAllChannels(agentId: string, text: string): Promise<void> {
    try {
      const rows = await db
        .select()
        .from(agentChannels)
        .where(and(eq(agentChannels.agentId, agentId), eq(agentChannels.enabled, true))) as any[];

      if (rows.length === 0) {
        logger.info('No enabled channels for agent', { agentId });
        return;
      }

      const message: ChannelMessage = { text, agentId };

      for (const row of rows) {
        const channelRow = row as AgentChannelRow;
        try {
          // Determine the target channel ID based on channel type
          const targetId = this.getDefaultTargetId(channelRow);
          if (targetId) {
            await this.sendMessage(channelRow.channelType, targetId, message);
          }
        } catch (err) {
          logger.error('Channel broadcast failed', {
            channelId: channelRow.id,
            channelType: channelRow.channelType,
            error: (err as Error).message,
          });
        }
      }
    } catch (err) {
      logger.error('sendToAllChannels error', { agentId, error: (err as Error).message });
    }
  }

  /**
   * Extract the default target ID from a channel config.
   * Each channel type stores the target differently in config.
   */
  private getDefaultTargetId(channelRow: AgentChannelRow): string | null {
    const config = channelRow.config || {};
    switch (channelRow.channelType) {
      case 'slack':
        return (config as any).default_channel || (config as any).channel_id || null;
      case 'teams':
        return (config as any).default_conversation || (config as any).conversation_id || null;
      case 'webhook':
        return (config as any).callback_url || null;
      default:
        return null;
    }
  }

  // --------------------------------------------------------------------------
  // Inbound: Channel → Agent
  // --------------------------------------------------------------------------

  /**
   * Route an inbound webhook request to the correct adapter.
   * Returns the parsed InboundMessage or null if the request should be ignored.
   */
  async handleInbound(channelType: string, req: any, res: any): Promise<InboundMessage | null> {
    const adapter = this.adapters.get(channelType);
    if (!adapter || !adapter.handleInbound) {
      logger.warn('No inbound handler for channel type', { channelType });
      return null;
    }

    try {
      const inbound = await adapter.handleInbound(req, res);
      if (inbound) {
        logger.info('Inbound message received', {
          channelType,
          senderId: inbound.senderId,
          textLength: inbound.text.length,
        });
      }
      return inbound;
    } catch (err) {
      logger.error('Inbound handling error', { channelType, error: (err as Error).message });
      return null;
    }
  }

  /**
   * Process an inbound message: find the agent for this channel,
   * send through chatService, and route the response back.
   */
  async processInbound(inbound: InboundMessage): Promise<void> {
    try {
      // Look up the channel config to find the agent
      const channelDbId = parseInt(inbound.channelId, 10);
      let agentId: string | null = null;
      let channelRow: AgentChannelRow | null = null;

      if (!isNaN(channelDbId)) {
        const rows = await db
          .select()
          .from(agentChannels)
          .where(eq(agentChannels.id, channelDbId)) as any[];
        if (rows.length > 0) {
          channelRow = rows[0] as AgentChannelRow;
          agentId = channelRow.agentId;
        }
      }

      // For webhooks, the agentId may be passed in metadata
      if (!agentId && inbound.metadata?.agentId) {
        agentId = inbound.metadata.agentId as string;
      }

      if (!agentId) {
        logger.warn('Cannot find agent for channel', {
          channelId: inbound.channelId,
          channelType: inbound.channelType,
        });
        return;
      }

      logger.info('Processing inbound message', {
        agentId,
        channelType: inbound.channelType,
        textPreview: inbound.text.slice(0, 80),
      });

      // Create/reuse conversation for this channel + sender
      const externalUserId = `${inbound.channelType}:${inbound.senderId}`;
      const conv = await startConversation(agentId, externalUserId, `${inbound.channelType} message`);
      await appendMessage(conv.id as number, 'user', inbound.text);

      // Generate reply via chat service
      const result = await generateReply(conv.id as number, inbound.text);

      // Send reply back through the same channel
      const replyMessage: ChannelMessage = {
        text: result.reply,
        agentId,
        conversationId: conv.id as number,
      };

      // Determine where to send the reply
      const replyTarget = this.getReplyTarget(inbound, channelRow);
      if (replyTarget) {
        await this.sendMessage(inbound.channelType, replyTarget, replyMessage);
      }

      logger.info('Channel reply sent', {
        channelType: inbound.channelType,
        agentId,
        replyLength: result.reply.length,
      });
    } catch (err) {
      logger.error('processInbound error', { error: (err as Error).message });
    }
  }

  /**
   * Determine where to send a reply for an inbound message.
   */
  private getReplyTarget(inbound: InboundMessage, channelRow: AgentChannelRow | null): string | null {
    // If the inbound has thread/channel metadata, use that
    if (inbound.metadata?.replyChannelId) {
      return inbound.metadata.replyChannelId as string;
    }
    if (inbound.threadId) {
      return inbound.threadId;
    }

    // Fall back to channel config defaults
    if (channelRow) {
      return this.getDefaultTargetId(channelRow);
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // Shutdown
  // --------------------------------------------------------------------------

  /**
   * Gracefully shut down all adapters.
   */
  async shutdown(): Promise<void> {
    for (const [name, adapter] of this.adapters.entries()) {
      if (adapter.shutdown) {
        try {
          await adapter.shutdown();
          logger.info('Channel adapter shut down', { adapter: name });
        } catch (err) {
          logger.error('Error shutting down adapter', { adapter: name, error: (err as Error).message });
        }
      }
    }
    this.initializedChannels.clear();
    logger.info('Channel router shut down');
  }
}

// ============================================================================
// Singleton
// ============================================================================

export const channelRouter = new ChannelRouter();
