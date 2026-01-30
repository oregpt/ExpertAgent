/**
 * Channel Abstraction Layer — Types & Interfaces
 *
 * Common types shared across all channel adapters (Slack, Teams, Webhook).
 * Every adapter implements the ChannelAdapter interface so the router
 * can treat them uniformly.
 */

// ============================================================================
// Messages
// ============================================================================

/**
 * Outbound message from agent → channel
 */
export interface ChannelMessage {
  text: string;
  agentId: string;
  conversationId?: number | undefined;
  metadata?: Record<string, any> | undefined;
}

/**
 * Inbound message from channel → agent
 */
export interface InboundMessage {
  text: string;
  senderId: string;
  senderName?: string | undefined;
  channelType: string;
  channelId: string;        // unique identifier for this channel instance (DB row id as string)
  threadId?: string | undefined;
  metadata?: Record<string, any> | undefined;
}

// ============================================================================
// Channel Adapter Interface
// ============================================================================

/**
 * Every channel adapter must implement this interface.
 *
 * - `name` — unique adapter identifier ('slack', 'teams', 'webhook')
 * - `initialize` — called on startup with channel-specific config from DB
 * - `sendMessage` — route an outbound message to this channel
 * - `handleInbound` — process an inbound webhook request from this channel
 * - `verifyWebhook` — verify request authenticity (signatures, etc.)
 * - `shutdown` — graceful cleanup
 */
export interface ChannelAdapter {
  readonly name: string;

  /**
   * Initialize the adapter with config from the DB (tokens, secrets, URLs).
   * Called once per channel configuration on startup.
   */
  initialize(config: Record<string, any>): Promise<void>;

  /**
   * Send an outbound message through this channel.
   * @param channelId — platform-specific target (Slack channel ID, Teams conversation ID, webhook URL key)
   * @param message — the message to send
   */
  sendMessage(channelId: string, message: ChannelMessage): Promise<void>;

  /**
   * Handle an inbound webhook request from the platform.
   * Must respond quickly (Slack requires < 3s).
   * Returns parsed InboundMessage or null if the request should be ignored (e.g., bot messages).
   */
  handleInbound?(req: any, res: any): Promise<InboundMessage | null>;

  /**
   * Verify the authenticity of an inbound webhook request.
   * Returns true if the request is legitimate.
   */
  verifyWebhook?(req: any): boolean;

  /**
   * Graceful shutdown — clean up connections, cancel timers, etc.
   */
  shutdown?(): Promise<void>;
}

// ============================================================================
// DB Row Shape (from ai_agent_channels)
// ============================================================================

/**
 * Row from the ai_agent_channels table (after query).
 */
export interface AgentChannelRow {
  id: number;
  agentId: string;
  channelType: string;
  channelName: string | null;
  config: Record<string, any>;
  enabled: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}
