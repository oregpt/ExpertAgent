import { Router } from 'express';
import { getCapability, listCapabilities } from '../capabilities/registry';
import { capabilityService } from '../capabilities/capabilityService';
import { getFeatures, isCapabilityAllowed } from '../licensing';

export const capabilityRouter = Router();

capabilityRouter.get('/', async (_req, res) => {
  const features = getFeatures();

  // If MCP Hub not licensed, return empty
  if (!features.mcpHub) {
    return res.json({ capabilities: [] });
  }

  // Filter to only allowed capabilities
  const allCapabilities = listCapabilities();
  const allowedCapabilities = allCapabilities.filter(cap => isCapabilityAllowed(cap.id));

  res.json({ capabilities: allowedCapabilities });
});

// Get enabled capabilities for a specific agent (for widget use)
capabilityRouter.get('/agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }

    const features = getFeatures();

    // If MCP Hub not licensed, return empty
    if (!features.mcpHub) {
      return res.json({ capabilities: [] });
    }

    // Get all capabilities with agent-specific enabled status
    const allCapabilities = await capabilityService.getAgentCapabilities(agentId);

    // Filter to only enabled + licensed capabilities
    const enabledCapabilities = allCapabilities
      .filter(cap => cap.enabled && cap.agentEnabled && isCapabilityAllowed(cap.id))
      .map(cap => ({
        id: cap.id,
        name: cap.name,
        description: cap.description,
        category: cap.category,
      }));

    res.json({ capabilities: enabledCapabilities });
  } catch (err) {
    console.error('[capabilities] Error fetching agent capabilities:', err);
    res.status(500).json({ error: 'Failed to fetch agent capabilities' });
  }
});

capabilityRouter.post('/anyapi/execute', async (req, res) => {
  try {
    const features = getFeatures();

    // Check MCP Hub license
    if (!features.mcpHub) {
      return res.status(403).json({
        error: 'MCP Hub not licensed. Upgrade to use capabilities.',
        code: 'MCP_HUB_NOT_LICENSED',
      });
    }

    // Check if anyapi capability is allowed
    if (!isCapabilityAllowed('anyapi')) {
      return res.status(403).json({
        error: 'AnyAPI capability not licensed.',
        code: 'CAPABILITY_NOT_LICENSED',
      });
    }

    const { action, params, agentId, conversationId, externalUserId } = req.body as {
      action: string;
      params?: Record<string, unknown>;
      agentId?: string;
      conversationId?: number;
      externalUserId?: string;
    };

    if (!action) return res.status(400).json({ error: 'action is required (e.g., coingecko.simple_price)' });

    const cap = getCapability('anyapi');
    if (!cap) return res.status(500).json({ error: 'AnyAPI capability not available' });

    const context: any = {
      agentId: agentId || 'default-agent',
      externalUserId,
    };
    if (conversationId !== undefined) {
      context.conversationId = conversationId;
    }

    const result = await cap.execute(action, params || {}, context);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to execute AnyAPI capability' });
  }
});
