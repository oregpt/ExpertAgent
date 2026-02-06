/**
 * Channel Routes
 *
 * REST API for managing agent channel configurations (CRUD) and
 * inbound webhook endpoints for Slack, Teams, and generic webhooks.
 *
 * CRUD routes are gated by the `multiChannel` feature flag.
 * Webhook endpoints handle their own authentication (signatures, etc.)
 * and must exist even if the feature is disabled (they return 404).
 */

import { Router, Request, Response } from 'express';
import { getFeatures } from '../licensing/features';
import { getAgentFeatures } from '../licensing/agentFeatures';
import { db } from '../db/client';
import { agentChannels } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { channelRouter } from '../channels/channelRouter';
import type { AgentChannelRow, InboundMessage } from '../channels/types';
import { requireAuth } from '../middleware/auth';
import { validate, channelCreateSchema } from '../middleware/validation';
import { encryptChannelConfig, decryptChannelConfig, maskChannelConfig } from '../utils/encryption';
import { dbNow } from '../db/date-utils';

export const channelRoutes = Router();

// ============================================================================
// Middleware: require multiChannel feature flag
// ============================================================================

function requireMultiChannel(_req: Request, res: Response, next: any): void {
  const features = getFeatures();
  if (!features.multiChannel) {
    res.status(403).json({
      error: 'Multi-channel feature not enabled',
      code: 'MULTI_CHANNEL_NOT_LICENSED',
      message: 'Enable the multiChannel feature flag or upgrade your license.',
    });
    return;
  }
  next();
}

/**
 * Middleware: check per-agent multiChannel feature flag
 */
async function requireMultiChannelForAgent(req: Request, res: Response, next: any): Promise<void> {
  const agentId = req.params.id;
  if (!agentId) {
    return next();
  }
  const features = await getAgentFeatures(agentId);
  if (!features.multiChannel) {
    res.status(403).json({
      error: 'Multi-channel feature disabled for this agent',
      code: 'MULTI_CHANNEL_DISABLED_FOR_AGENT',
      message: 'This feature is disabled for this agent. Enable it in the agent configuration.',
    });
    return;
  }
  next();
}

// ============================================================================
// CRUD Routes — Channel Management (feature-gated)
// ============================================================================

/**
 * GET /api/agents/:id/channels
 * List all configured channels for an agent
 */
channelRoutes.get('/agents/:id/channels', requireAuth, requireMultiChannel, requireMultiChannelForAgent, async (req: Request, res: Response) => {
  try {
    const agentId = req.params.id!;
    const rows = await db
      .select()
      .from(agentChannels)
      .where(eq(agentChannels.agentId, agentId)) as any[];

    res.json({
      channels: rows.map((r: AgentChannelRow) => ({
        id: r.id,
        agentId: r.agentId,
        channelType: r.channelType,
        channelName: r.channelName,
        enabled: r.enabled,
        // Mask sensitive fields (show "••••configured" instead of actual secrets)
        config: maskChannelConfig(r.config || {}),
        hasConfig: !!(r.config && Object.keys(r.config).length > 0),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (err) {
    console.error('[channel-routes] List channels error:', err);
    res.status(500).json({ error: 'Failed to list channels' });
  }
});

/**
 * POST /api/agents/:id/channels
 * Add a new channel configuration
 * Body: { channel_type, channel_name?, config }
 */
channelRoutes.post('/agents/:id/channels', requireAuth, requireMultiChannel, requireMultiChannelForAgent, validate(channelCreateSchema), async (req: Request, res: Response) => {
  try {
    const agentId = req.params.id!;
    const { channel_type, channel_name, config } = req.body;

    // Validation
    const validTypes = ['slack', 'teams', 'webhook'];
    if (!channel_type || !validTypes.includes(channel_type)) {
      return res.status(400).json({
        error: `channel_type must be one of: ${validTypes.join(', ')}`,
      });
    }

    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'config object is required' });
    }

    // Validate channel-specific required fields
    const configError = validateChannelConfig(channel_type, config);
    if (configError) {
      return res.status(400).json({ error: configError });
    }

    // Encrypt sensitive fields before storing in DB
    const encryptedConfig = encryptChannelConfig(config);

    const rows = await db
      .insert(agentChannels)
      .values({
        agentId,
        channelType: channel_type,
        channelName: channel_name || null,
        config: encryptedConfig,
        enabled: true,
      })
      .returning() as any[];

    const created = rows[0] as AgentChannelRow;

    // Initialize the adapter with PLAINTEXT config (not encrypted)
    try {
      const adapter = channelRouter.getAdapter(channel_type);
      if (adapter) {
        await adapter.initialize(config);
        console.log(`[channel-routes] Initialized new ${channel_type} channel ${created.id}`);
      }
    } catch (initErr) {
      console.warn(`[channel-routes] Could not initialize new channel (saved anyway):`, initErr);
    }

    res.status(201).json({
      id: created.id,
      agentId: created.agentId,
      channelType: created.channelType,
      channelName: created.channelName,
      enabled: created.enabled,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  } catch (err) {
    console.error('[channel-routes] Create channel error:', err);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

/**
 * PUT /api/agents/:id/channels/:channelId
 * Update a channel configuration
 * Body: { channel_name?, config?, enabled? }
 */
channelRoutes.put('/agents/:id/channels/:channelId', requireAuth, requireMultiChannel, requireMultiChannelForAgent, async (req: Request, res: Response) => {
  try {
    const agentId = req.params.id!;
    const channelId = parseInt(req.params.channelId!, 10);

    if (isNaN(channelId)) {
      return res.status(400).json({ error: 'Invalid channel ID' });
    }

    const { channel_name, config, enabled } = req.body;

    // Build update object
    const updateData: any = { updatedAt: dbNow() };
    if (channel_name !== undefined) updateData.channelName = channel_name;
    if (config !== undefined) updateData.config = encryptChannelConfig(config); // Encrypt before storing
    if (enabled !== undefined) updateData.enabled = enabled;

    const rows = await db
      .update(agentChannels)
      .set(updateData)
      .where(and(eq(agentChannels.id, channelId), eq(agentChannels.agentId, agentId)))
      .returning() as any[];

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const updated = rows[0] as AgentChannelRow;

    // Re-initialize adapter with PLAINTEXT config (not encrypted)
    if (config !== undefined) {
      try {
        const adapter = channelRouter.getAdapter(updated.channelType);
        if (adapter) {
          await adapter.initialize(config);
          console.log(`[channel-routes] Re-initialized ${updated.channelType} channel ${channelId}`);
        }
      } catch (initErr) {
        console.warn(`[channel-routes] Could not re-initialize channel:`, initErr);
      }
    }

    res.json({
      id: updated.id,
      agentId: updated.agentId,
      channelType: updated.channelType,
      channelName: updated.channelName,
      enabled: updated.enabled,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    console.error('[channel-routes] Update channel error:', err);
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

/**
 * DELETE /api/agents/:id/channels/:channelId
 * Remove a channel configuration
 */
channelRoutes.delete('/agents/:id/channels/:channelId', requireAuth, requireMultiChannel, requireMultiChannelForAgent, async (req: Request, res: Response) => {
  try {
    const agentId = req.params.id!;
    const channelId = parseInt(req.params.channelId!, 10);

    if (isNaN(channelId)) {
      return res.status(400).json({ error: 'Invalid channel ID' });
    }

    const rows = await db
      .delete(agentChannels)
      .where(and(eq(agentChannels.id, channelId), eq(agentChannels.agentId, agentId)))
      .returning() as any[];

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    res.json({ success: true, id: channelId });
  } catch (err) {
    console.error('[channel-routes] Delete channel error:', err);
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

// ============================================================================
// Webhook Endpoints — Inbound from External Platforms
// These must work without standard auth (they verify themselves).
// Return 404 when feature is disabled.
// ============================================================================

/**
 * POST /api/channels/slack/events
 * Slack Events API webhook endpoint
 */
channelRoutes.post('/channels/slack/events', async (req: Request, res: Response) => {
  const features = getFeatures();
  if (!features.multiChannel) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    // Verify signature
    const slackAdapter = channelRouter.getAdapter('slack');
    if (slackAdapter?.verifyWebhook && !slackAdapter.verifyWebhook(req)) {
      console.warn('[channel-routes] Slack signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Handle inbound (this may respond with 200 + challenge, or just 200)
    const inbound = await channelRouter.handleInbound('slack', req, res);

    if (inbound) {
      // Find the agent for this Slack workspace/channel
      const agentChannelRow = await findChannelForInbound('slack', req.body);
      if (agentChannelRow) {
        inbound.channelId = String(agentChannelRow.id);
        // Process async — don't block the webhook response
        channelRouter.processInbound(inbound).catch((err) => {
          console.error('[channel-routes] Slack inbound processing error:', err);
        });
      } else {
        console.warn('[channel-routes] No agent channel found for Slack event');
      }
    }
  } catch (err) {
    console.error('[channel-routes] Slack events error:', err);
    // Don't send error response if res already sent (by handleInbound)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal error' });
    }
  }
});

/**
 * POST /api/channels/teams/messages
 * Teams Bot Framework webhook endpoint
 */
channelRoutes.post('/channels/teams/messages', async (req: Request, res: Response) => {
  const features = getFeatures();
  if (!features.multiChannel) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    // Handle inbound (responds with 200 immediately)
    const inbound = await channelRouter.handleInbound('teams', req, res);

    if (inbound) {
      // Find the agent for this Teams conversation
      const agentChannelRow = await findChannelForInbound('teams', req.body);
      if (agentChannelRow) {
        inbound.channelId = String(agentChannelRow.id);
        // Process async
        channelRouter.processInbound(inbound).catch((err) => {
          console.error('[channel-routes] Teams inbound processing error:', err);
        });
      } else {
        console.warn('[channel-routes] No agent channel found for Teams message');
      }
    }
  } catch (err) {
    console.error('[channel-routes] Teams messages error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal error' });
    }
  }
});

/**
 * POST /api/channels/webhook/:agentId
 * Generic inbound webhook — the agentId is in the URL
 */
channelRoutes.post('/channels/webhook/:agentId', async (req: Request, res: Response) => {
  const features = getFeatures();
  if (!features.multiChannel) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const agentId = req.params.agentId!;

    // Find the webhook channel for this agent
    const rows = await db
      .select()
      .from(agentChannels)
      .where(
        and(
          eq(agentChannels.agentId, agentId),
          eq(agentChannels.channelType, 'webhook'),
          eq(agentChannels.enabled, true)
        )
      ) as any[];

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No webhook channel configured for this agent' });
    }

    const channelRow = rows[0] as AgentChannelRow;

    // Verify webhook signature (decrypt config first for verification)
    const webhookAdapter = channelRouter.getAdapter('webhook');
    if (webhookAdapter?.verifyWebhook) {
      // Re-initialize with this specific channel's decrypted config for verification
      const decryptedConfig = decryptChannelConfig(channelRow.config || {});
      await webhookAdapter.initialize(decryptedConfig);
      if (!webhookAdapter.verifyWebhook(req)) {
        console.warn('[channel-routes] Webhook signature verification failed');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Handle inbound
    const inbound = await channelRouter.handleInbound('webhook', req, res);

    if (inbound) {
      inbound.channelId = String(channelRow.id);
      inbound.metadata = { ...inbound.metadata, agentId };
      // Process async
      channelRouter.processInbound(inbound).catch((err) => {
        console.error('[channel-routes] Webhook inbound processing error:', err);
      });
    }
  } catch (err) {
    console.error('[channel-routes] Webhook error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal error' });
    }
  }
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Validate channel-specific required config fields.
 * Returns error message or null if valid.
 */
function validateChannelConfig(channelType: string, config: Record<string, any>): string | null {
  switch (channelType) {
    case 'slack':
      if (!config.bot_token) return 'Slack config requires bot_token';
      if (!config.signing_secret) return 'Slack config requires signing_secret';
      return null;

    case 'teams':
      if (!config.app_id) return 'Teams config requires app_id';
      if (!config.app_password) return 'Teams config requires app_password';
      return null;

    case 'webhook':
      if (!config.callback_url) return 'Webhook config requires callback_url';
      return null;

    default:
      return `Unknown channel type: ${channelType}`;
  }
}

/**
 * Find the agent channel DB row for an inbound message.
 * Matches by channel_type and tries to match by team/workspace/tenant info.
 */
async function findChannelForInbound(channelType: string, body: any): Promise<AgentChannelRow | null> {
  try {
    // For now, find the first enabled channel of this type.
    // In a multi-tenant setup, we'd match by workspace ID, tenant ID, etc.
    const rows = await db
      .select()
      .from(agentChannels)
      .where(
        and(
          eq(agentChannels.channelType, channelType),
          eq(agentChannels.enabled, true)
        )
      ) as any[];

    if (rows.length === 0) return null;

    // If there's only one, return it
    if (rows.length === 1) return rows[0] as AgentChannelRow;

    // Try to match by workspace/team ID for Slack
    if (channelType === 'slack' && body?.team_id) {
      const match = rows.find((r: any) => {
        const config = r.config as Record<string, any>;
        return config?.team_id === body.team_id;
      });
      if (match) return match as AgentChannelRow;
    }

    // Try to match by tenant ID for Teams
    if (channelType === 'teams' && body?.channelData?.tenant?.id) {
      const tenantId = body.channelData.tenant.id;
      const match = rows.find((r: any) => {
        const config = r.config as Record<string, any>;
        return config?.tenant_id === tenantId;
      });
      if (match) return match as AgentChannelRow;
    }

    // Fallback to first match
    return rows[0] as AgentChannelRow;
  } catch (err) {
    console.error(`[channel-routes] findChannelForInbound error:`, err);
    return null;
  }
}
