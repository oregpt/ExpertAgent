import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../db/client';
import { agents, folders, tags, documentTags, documents } from '../db/schema';
import { ensureDefaultAgent } from '../chat/chatService';
import { AVAILABLE_MODELS, getAvailableModels, OllamaProvider } from '../llm';
import { capabilityService } from '../capabilities';
import { getOrchestrator, getMCPServerManager } from '../mcp-hub';
import { eq, and, isNull, sql, inArray } from 'drizzle-orm';
import { getFeatures, canCreateAgent, getLicensingStatus, getAgentFeatures, getAgentFeaturesDetailed, invalidateAgentFeaturesCache, V2_FEATURE_KEYS } from '../licensing';
import type { AgentFeatureOverrides } from '../licensing';
import { createDefaultDocuments } from '../memory';
import { dbNow } from '../db/date-utils';
import {
  getGitLabConnection,
  saveGitLabConnection,
  deleteGitLabConnection,
  validateGitLabConnection,
  getRefreshHistory,
  getRefresh,
  deleteRefresh,
  executeRefresh,
  getArchivePath,
} from '../tools/gitlab';

export const adminRouter = Router();

// Configure multer for avatar uploads
const IS_DESKTOP = process.env.IS_DESKTOP === 'true';
const dataDir = process.env.EXPERT_AGENT_DATA_DIR || process.cwd();
const uploadsPath = IS_DESKTOP ? path.join(dataDir, 'uploads') : path.join(__dirname, '../../../uploads');
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsPath)) {
      fs.mkdirSync(uploadsPath, { recursive: true });
    }
    cb(null, uploadsPath);
  },
  filename: (req, file, cb) => {
    // Use agentId + timestamp for unique filename
    const agentId = req.params.agentId || 'unknown';
    const ext = path.extname(file.originalname);
    const filename = `avatar-${agentId}-${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const avatarUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Only allow image files
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP, SVG)'));
    }
  },
});

// Get available LLM models (cloud + local Ollama if running)
adminRouter.get('/models', async (_req, res) => {
  try {
    const models = await getAvailableModels();
    res.json({ models });
  } catch {
    // Fallback to static cloud models if anything goes wrong
    res.json({ models: AVAILABLE_MODELS });
  }
});

// ============================================================================
// Ollama (Local LLM) Endpoints
// ============================================================================

// Check if Ollama is running
adminRouter.get('/ollama/status', async (_req, res) => {
  const available = await OllamaProvider.isAvailable();
  res.json({ available });
});

// List Ollama models
adminRouter.get('/ollama/models', async (_req, res) => {
  try {
    const models = await OllamaProvider.listModels();
    res.json({ models });
  } catch {
    res.json({ models: [] });
  }
});

// ============================================================================
// Licensing Status
// ============================================================================

// Get current licensing status and features
adminRouter.get('/licensing', async (_req, res) => {
  try {
    const status = getLicensingStatus();
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get licensing status' });
  }
});

// ============================================================================
// Multi-Agent Routes
// ============================================================================

// List all agents
adminRouter.get('/agents', async (_req, res) => {
  try {
    // Ensure at least one agent exists
    await ensureDefaultAgent();
    const rows = await db.select().from(agents);
    res.json({ agents: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load agents' });
  }
});

// Create a new agent
adminRouter.post('/agents', async (req, res) => {
  try {
    const { name, description, instructions, defaultModel, modelMode, allowedModels, features: reqFeatures } = req.body as {
      name: string;
      description?: string;
      instructions?: string;
      defaultModel?: string;
      modelMode?: 'single' | 'multi';
      allowedModels?: string[];
      features?: AgentFeatureOverrides;
    };

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    // Check licensing: can we create more agents?
    const existingAgents = await db.select().from(agents);
    const agentCount = existingAgents.length;

    if (!canCreateAgent(agentCount)) {
      const features = getFeatures();
      return res.status(403).json({
        error: features.multiAgent
          ? `Agent limit reached (max: ${features.maxAgents})`
          : 'Multi-agent feature not licensed. Upgrade to create additional agents.',
        code: 'AGENT_LIMIT_REACHED',
      });
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 60);

    // Generate unique ID
    const id = `agent-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Default features for new agents: all v2 features ON (matching global)
    // This means new agents inherit global defaults unless overridden
    const agentFeatures: AgentFeatureOverrides = reqFeatures || {};

    const inserted = (await db
      .insert(agents)
      .values({
        id,
        slug,
        name,
        description: description || '',
        instructions: instructions || 'You are a helpful AI assistant.',
        defaultModel: defaultModel || process.env.CLAUDE_DEFAULT_MODEL || 'claude-sonnet-4-20250514',
        modelMode: modelMode || 'single',
        allowedModels: allowedModels || null,
        features: agentFeatures,
      })
      .returning()) as any[];

    // v2: Auto-create default soul/memory/context documents if soulMemory is enabled
    const features = getFeatures();
    const effectiveSoulMemory = features.soulMemory && (agentFeatures.soulMemory !== false);
    if (effectiveSoulMemory) {
      createDefaultDocuments(id, name).catch((err) => {
        console.error(`[admin] Failed to create default documents for agent ${id}:`, err);
      });
    }

    // Auto-enable default capabilities for new agents (ones that don't require auth)
    if (features.mcpHub) {
      const defaultEnabledCaps = [
        'anyapi',         // Universal API caller (has built-in free APIs)
        'coingecko',      // Crypto data (no auth required)
        'sec-edgar',      // SEC filings (no auth required)
        'bitwave-price',  // Crypto prices (no auth required)
        'thetie-canton',  // Canton analytics (no auth required)
        'faam-tracker',   // Financial asset tracker (no auth required)
      ];
      for (const capId of defaultEnabledCaps) {
        capabilityService.setAgentCapability(id, capId, true).catch((err) => {
          console.error(`[admin] Failed to auto-enable capability ${capId} for agent ${id}:`, err);
        });
      }
      console.log(`[admin] Auto-enabled ${defaultEnabledCaps.length} default capabilities for agent ${id}`);
    }

    res.json({ agent: inserted[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// Get a specific agent
adminRouter.get('/agents/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const rows = (await db.select().from(agents).where(eq(agents.id, agentId)).limit(1)) as any[];
    const agent = rows[0];

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ agent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load agent' });
  }
});

// Update a specific agent
adminRouter.put('/agents/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { name, description, instructions, defaultModel, modelMode, allowedModels, branding, features: reqFeatures } = req.body as {
      name?: string;
      description?: string;
      instructions?: string;
      defaultModel?: string;
      modelMode?: 'single' | 'multi';
      allowedModels?: string[] | null;
      branding?: Record<string, any> | null;
      features?: AgentFeatureOverrides | null;
    };

    const patch: any = { updatedAt: dbNow() };
    if (typeof name === 'string') patch.name = name;
    if (typeof description === 'string') patch.description = description;
    if (typeof instructions === 'string') patch.instructions = instructions;
    if (typeof defaultModel === 'string') patch.defaultModel = defaultModel;
    if (typeof modelMode === 'string') patch.modelMode = modelMode;
    if (allowedModels !== undefined) patch.allowedModels = allowedModels;
    if (branding !== undefined) patch.branding = branding;
    if (reqFeatures !== undefined) patch.features = reqFeatures;

    const rows = (await db
      .update(agents)
      .set(patch)
      .where(eq(agents.id, agentId))
      .returning()) as any[];

    const agent = rows[0];
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Invalidate per-agent features cache if features were updated
    if (reqFeatures !== undefined) {
      invalidateAgentFeaturesCache(agentId);
    }

    res.json({ agent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// Get effective features for an agent (resolved against global)
adminRouter.get('/agents/:agentId/features', async (req, res) => {
  try {
    const { agentId } = req.params;
    const detailed = await getAgentFeaturesDetailed(agentId);
    res.json(detailed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get agent features' });
  }
});

// Update agent branding only
adminRouter.put('/agents/:agentId/branding', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { branding } = req.body as { branding: Record<string, any> };

    // Check licensing: is custom branding allowed?
    const features = getFeatures();
    if (!features.customBranding) {
      return res.status(403).json({
        error: 'Custom branding not licensed. Upgrade to customize your agent appearance.',
        code: 'BRANDING_NOT_LICENSED',
      });
    }

    if (!branding || typeof branding !== 'object') {
      return res.status(400).json({ error: 'branding object is required' });
    }

    const rows = (await db
      .update(agents)
      .set({ branding, updatedAt: dbNow() })
      .where(eq(agents.id, agentId))
      .returning()) as any[];

    const agent = rows[0];
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ agent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update branding' });
  }
});

// Delete an agent
adminRouter.delete('/agents/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;

    // Prevent deleting the last agent
    const allAgents = await db.select().from(agents);
    if (allAgents.length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last agent' });
    }

    await db.delete(agents).where(eq(agents.id, agentId));
    res.json({ success: true, agentId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// Upload avatar image for an agent
adminRouter.post('/agents/:agentId/avatar', avatarUpload.single('avatar'), async (req, res) => {
  try {
    const { agentId } = req.params;
    const file = req.file;

    if (!agentId) {
      return res.status(400).json({ error: 'Agent ID is required' });
    }

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get current agent to access existing branding
    const rows = (await db.select().from(agents).where(eq(agents.id, agentId)).limit(1)) as any[];
    const agent = rows[0];

    if (!agent) {
      // Clean up uploaded file if agent doesn't exist
      fs.unlinkSync(file.path);
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Delete old avatar file if it exists
    const existingBranding = agent.branding || {};
    if (existingBranding.avatarUrl && existingBranding.avatarUrl.startsWith('/uploads/')) {
      const oldFilePath = path.join(uploadsPath, path.basename(existingBranding.avatarUrl));
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    // Build the URL path for the uploaded file
    const avatarUrl = `/uploads/${file.filename}`;

    // Update branding with new avatar URL
    const updatedBranding = {
      ...existingBranding,
      avatarUrl,
    };

    await db
      .update(agents)
      .set({ branding: updatedBranding, updatedAt: dbNow() })
      .where(eq(agents.id, agentId));

    res.json({ success: true, avatarUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// Delete avatar for an agent
adminRouter.delete('/agents/:agentId/avatar', async (req, res) => {
  try {
    const { agentId } = req.params;

    if (!agentId) {
      return res.status(400).json({ error: 'Agent ID is required' });
    }

    // Get current agent
    const rows = (await db.select().from(agents).where(eq(agents.id, agentId)).limit(1)) as any[];
    const agent = rows[0];

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const existingBranding = agent.branding || {};

    // Delete the file if it exists
    if (existingBranding.avatarUrl && existingBranding.avatarUrl.startsWith('/uploads/')) {
      const filePath = path.join(uploadsPath, path.basename(existingBranding.avatarUrl));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Remove avatarUrl from branding
    const { avatarUrl, ...restBranding } = existingBranding;

    await db
      .update(agents)
      .set({ branding: restBranding, updatedAt: dbNow() })
      .where(eq(agents.id, agentId));

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete avatar' });
  }
});

// ============================================================================
// Legacy single-agent routes (for backwards compatibility)
// ============================================================================

adminRouter.get('/agent', async (_req, res) => {
  try {
    const id = await ensureDefaultAgent();
    const rows = (await db.select().from(agents).where(eq(agents.id, id)).limit(1)) as any[];
    const agent = rows[0];
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    res.json({ agent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load agent config' });
  }
});

adminRouter.post('/agent', async (req, res) => {
  try {
    const id = await ensureDefaultAgent();
    const { name, description, instructions, defaultModel } = req.body as {
      name?: string;
      description?: string;
      instructions?: string;
      defaultModel?: string;
    };

    const patch: any = {};
    if (typeof name === 'string') patch.name = name;
    if (typeof description === 'string') patch.description = description;
    if (typeof instructions === 'string') patch.instructions = instructions;
    if (typeof defaultModel === 'string') patch.defaultModel = defaultModel;

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    const rows = (await db
      .update(agents)
      .set(patch)
      .where(eq(agents.id, id))
      .returning()) as any[];

    const agent = rows[0];
    res.json({ agent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update agent config' });
  }
});

// ============================================================================
// Capability Routes
// ============================================================================

// Get all capabilities (with agent enablement status)
adminRouter.get('/capabilities', async (req, res) => {
  try {
    // Use agentId from query param, or fall back to default agent
    const agentId = (req.query.agentId as string) || (await ensureDefaultAgent());
    const caps = await capabilityService.getAgentCapabilities(agentId);

    // Check which have tokens configured
    const capsWithTokenStatus = await Promise.all(
      caps.map(async (cap) => ({
        ...cap,
        hasTokens: await capabilityService.hasCapabilityTokens(agentId, cap.id),
      }))
    );

    res.json({ capabilities: capsWithTokenStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load capabilities' });
  }
});

// Enable/disable a capability for the agent
adminRouter.post('/capabilities/:capabilityId/toggle', async (req, res) => {
  try {
    const { capabilityId } = req.params;
    const { enabled, agentId: bodyAgentId } = req.body as { enabled: boolean; agentId?: string };
    // Use agentId from body, or fall back to default agent
    const agentId = bodyAgentId || (await ensureDefaultAgent());

    await capabilityService.setAgentCapability(agentId, capabilityId, enabled);

    res.json({ success: true, capabilityId, enabled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to toggle capability' });
  }
});

// Set tokens for a capability
adminRouter.post('/capabilities/:capabilityId/tokens', async (req, res) => {
  try {
    const { capabilityId } = req.params;
    const { token1, token2, token3, token4, token5, expiresAt, agentId: bodyAgentId } = req.body as {
      token1?: string;
      token2?: string;
      token3?: string;
      token4?: string;
      token5?: string;
      expiresAt?: string;
      agentId?: string;
    };
    // Use agentId from body, or fall back to default agent
    const agentId = bodyAgentId || (await ensureDefaultAgent());

    await capabilityService.setCapabilityTokens(
      agentId,
      capabilityId,
      { token1, token2, token3, token4, token5 },
      expiresAt ? new Date(expiresAt) : undefined
    );

    // For bundled MCP servers, configure tokens immediately (live reload)
    const manager = getMCPServerManager();
    const singleTokenCaps = ['mcp-ccview', 'mcp-ccexplorer-pro', 'mcp-brave-search', 'mcp-slack', 'slack', 'notion', 'bitwave-price', 'wallet-balance', 'kaiko', 'thetie-canton', 'gamma', 'faam-tracker', 'trader'];
    const multiTokenCaps = ['quickbooks', 'calendar', 'sheets', 'email', 'binanceus', 'kraken', 'coinbase', 'google-docs', 'plaid', 'chatscraper'];

    if (token1 && singleTokenCaps.includes(capabilityId)) {
      manager.configureBundledServer(capabilityId, token1);
    } else if (multiTokenCaps.includes(capabilityId)) {
      manager.configureBundledServerTokens(capabilityId, { token1, token2, token3, token4, token5 });
    }

    res.json({ success: true, capabilityId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save tokens' });
  }
});

// Delete tokens for a capability
adminRouter.delete('/capabilities/:capabilityId/tokens', async (req, res) => {
  try {
    const { capabilityId } = req.params;
    // Use agentId from query param, or fall back to default agent
    const agentId = (req.query.agentId as string) || (await ensureDefaultAgent());

    await capabilityService.deleteCapabilityTokens(agentId, capabilityId);

    res.json({ success: true, capabilityId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete tokens' });
  }
});

// Create a new custom capability (for anyapi configs)
adminRouter.post('/capabilities', async (req, res) => {
  try {
    const { id, name, description, type, category, config } = req.body as {
      id: string;
      name: string;
      description?: string;
      type: 'mcp' | 'anyapi';
      category?: string;
      config?: any;
    };

    if (!id || !name || !type) {
      return res.status(400).json({ error: 'id, name, and type are required' });
    }

    await capabilityService.upsertCapability({
      id,
      name,
      description: description || '',
      type,
      category,
      config,
      enabled: true,
    });

    res.json({ success: true, capabilityId: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create capability' });
  }
});

// Delete a capability
adminRouter.delete('/capabilities/:capabilityId', async (req, res) => {
  try {
    const { capabilityId } = req.params;

    await capabilityService.deleteCapability(capabilityId);

    res.json({ success: true, capabilityId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete capability' });
  }
});

// ============================================================================
// Per-Agent API Keys Routes
// ============================================================================

// Get API key status for an agent
adminRouter.get('/agents/:agentId/api-keys', async (req, res) => {
  try {
    const { agentId } = req.params;
    const settings = await capabilityService.getAgentApiKeysStatus(agentId);
    res.json({ settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load API keys' });
  }
});

// Set an API key for an agent
adminRouter.post('/agents/:agentId/api-keys/:key', async (req, res) => {
  try {
    const { agentId, key } = req.params;
    const { value } = req.body as { value: string };

    const allowedKeys = ['anthropic_api_key', 'openai_api_key', 'gemini_api_key', 'grok_api_key'];
    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ error: 'Invalid API key type' });
    }

    if (!value || typeof value !== 'string') {
      return res.status(400).json({ error: 'Value is required' });
    }

    await capabilityService.setAgentApiKey(agentId, key, value);
    res.json({ success: true, key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save API key' });
  }
});

// Delete an API key for an agent
adminRouter.delete('/agents/:agentId/api-keys/:key', async (req, res) => {
  try {
    const { agentId, key } = req.params;

    const allowedKeys = ['anthropic_api_key', 'openai_api_key', 'gemini_api_key', 'grok_api_key'];
    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ error: 'Invalid API key type' });
    }

    await capabilityService.deleteAgentApiKey(agentId, key);
    res.json({ success: true, key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

// ============================================================================
// MCP Hub Routes
// ============================================================================

// Get MCP Hub status (optionally filtered by agent's enabled capabilities)
adminRouter.get('/mcp/status', async (req, res) => {
  try {
    const agentId = req.query.agentId as string | undefined;
    const orchestrator = getOrchestrator();
    const globalStatus = orchestrator.getHubStatus();
    
    // If no agentId, return global status
    if (!agentId) {
      return res.json(globalStatus);
    }
    
    // Get agent's enabled capabilities and filter
    const agentCaps = await capabilityService.getAgentCapabilities(agentId);
    const enabledCapIds = new Set(
      agentCaps
        .filter(c => c.agentEnabled && c.enabled)
        .map(c => c.id)
    );
    
    // Map capability IDs to server names
    const capToServer: Record<string, string> = {
      'coingecko': 'anyapi',
      'mcp-ccview': 'ccview',
      'mcp-ccexplorer-pro': 'ccexplorer',
      'mcp-lighthouse': 'lighthouse',
    };
    
    // Count enabled servers
    const enabledServers = new Set<string>();
    for (const capId of enabledCapIds) {
      const serverName = capToServer[capId];
      if (serverName) enabledServers.add(serverName);
    }
    
    // Count tools for enabled servers only
    const allTools = orchestrator.getAllTools();
    const enabledTools = allTools.filter((t: any) => enabledServers.has(t.server));
    
    res.json({
      ...globalStatus,
      activeServers: enabledServers.size,
      totalTools: enabledTools.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get MCP Hub status' });
  }
});

// Get all available MCP tools
adminRouter.get('/mcp/tools', async (_req, res) => {
  try {
    const orchestrator = getOrchestrator();
    const tools = orchestrator.getAllTools();
    res.json({ tools });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get MCP tools' });
  }
});

// Execute an MCP tool (for testing)
adminRouter.post('/mcp/execute', async (req, res) => {
  try {
    const { server, tool, arguments: args } = req.body as {
      server: string;
      tool: string;
      arguments: any;
    };

    if (!server || !tool) {
      return res.status(400).json({ error: 'server and tool are required' });
    }

    const orchestrator = getOrchestrator();
    const result = await orchestrator.executeAction(server, tool, args || {});

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to execute MCP tool' });
  }
});

// Get well-known MCP servers (available for installation)
adminRouter.get('/mcp/available-servers', async (_req, res) => {
  try {
    const { getMCPServerManager, WELL_KNOWN_MCP_SERVERS } = await import('../mcp-hub');
    res.json({
      servers: WELL_KNOWN_MCP_SERVERS.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        category: s.category,
        npmPackage: s.npmPackage,
        envVars: s.envVars,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get available MCP servers' });
  }
});

// Get tools for a specific agent (based on their enabled capabilities)
adminRouter.get('/agents/:agentId/tools', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { getMCPServerManager } = await import('../mcp-hub');
    const manager = getMCPServerManager();
    const tools = await manager.getToolsForAgent(agentId);
    res.json({ tools });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get agent tools' });
  }
});

// Start an MCP server for an agent
adminRouter.post('/agents/:agentId/mcp/start', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { capabilityId } = req.body as { capabilityId: string };

    if (!capabilityId) {
      return res.status(400).json({ error: 'capabilityId is required' });
    }

    const { getMCPServerManager } = await import('../mcp-hub');
    const manager = getMCPServerManager();
    const server = await manager.startServerForAgent(agentId, capabilityId);

    if (server) {
      res.json({
        success: true,
        server: {
          name: server.name,
          version: server.version,
          tools: (await server.listTools()).map((t) => ({ name: t.name, description: t.description })),
        },
      });
    } else {
      res.status(400).json({ error: 'Failed to start MCP server' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start MCP server' });
  }
});

// Stop an MCP server for an agent
adminRouter.post('/agents/:agentId/mcp/stop', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { capabilityId } = req.body as { capabilityId: string };

    if (!capabilityId) {
      return res.status(400).json({ error: 'capabilityId is required' });
    }

    const { getMCPServerManager } = await import('../mcp-hub');
    const manager = getMCPServerManager();
    await manager.stopServerForAgent(agentId, capabilityId);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to stop MCP server' });
  }
});

// Add a custom MCP server
adminRouter.post('/mcp/custom-server', async (req, res) => {
  try {
    const { id, name, description, command, args, category, envVars } = req.body as {
      id: string;
      name: string;
      description: string;
      command: string;
      args: string[];
      category?: string;
      envVars?: Array<{ name: string; label: string; required: boolean; tokenField: string }>;
    };

    if (!id || !name || !command || !args) {
      return res.status(400).json({ error: 'id, name, command, and args are required' });
    }

    const { getMCPServerManager } = await import('../mcp-hub');
    const manager = getMCPServerManager();
    const serverConfig: Parameters<typeof manager.addCustomServer>[0] = {
      id,
      name,
      description,
      command,
      args,
    };
    if (category) serverConfig.category = category;
    if (envVars) serverConfig.envVars = envVars;
    await manager.addCustomServer(serverConfig);

    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add custom MCP server' });
  }
});

// ============================================================================
// Knowledge Base - Folder Routes
// ============================================================================

// List all folders for an agent (returns tree structure)
adminRouter.get('/agents/:agentId/folders', async (req, res) => {
  try {
    const { agentId } = req.params;
    const rows = await db
      .select()
      .from(folders)
      .where(eq(folders.agentId, agentId))
      .orderBy(folders.name);

    // Build tree structure
    const buildTree = (parentId: number | null): any[] => {
      return rows
        .filter((f: any) => f.parentId === parentId)
        .map((folder: any) => ({
          ...folder,
          children: buildTree(folder.id),
        }));
    };

    const tree = buildTree(null);
    res.json({ folders: tree, flatList: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load folders' });
  }
});

// Create a folder
adminRouter.post('/agents/:agentId/folders', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { name, parentId } = req.body as { name: string; parentId?: number | null };

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }

    const inserted = await db
      .insert(folders)
      .values({
        agentId,
        name: name.trim(),
        parentId: parentId || null,
      })
      .returning();

    res.json({ folder: inserted[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Update (rename) a folder
adminRouter.put('/agents/:agentId/folders/:folderId', async (req, res) => {
  try {
    const { agentId, folderId } = req.params;
    const { name } = req.body as { name: string };

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }

    const updated = await db
      .update(folders)
      .set({ name: name.trim(), updatedAt: dbNow() })
      .where(and(eq(folders.id, parseInt(folderId)), eq(folders.agentId, agentId)))
      .returning();

    if (!updated[0]) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json({ folder: updated[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// Move a folder to a new parent
adminRouter.put('/agents/:agentId/folders/:folderId/move', async (req, res) => {
  try {
    const { agentId, folderId } = req.params;
    const { parentId } = req.body as { parentId: number | null };

    // Prevent moving a folder into itself or its descendants
    const folderIdNum = parseInt(folderId);
    if (parentId === folderIdNum) {
      return res.status(400).json({ error: 'Cannot move folder into itself' });
    }

    const updated = await db
      .update(folders)
      .set({ parentId: parentId || null, updatedAt: dbNow() })
      .where(and(eq(folders.id, folderIdNum), eq(folders.agentId, agentId)))
      .returning();

    if (!updated[0]) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json({ folder: updated[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to move folder' });
  }
});

// Delete a folder (only if empty - no documents)
adminRouter.delete('/agents/:agentId/folders/:folderId', async (req, res) => {
  try {
    const { agentId, folderId } = req.params;
    const folderIdNum = parseInt(folderId);

    // Get the folder to find its parent
    const folderRows = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, folderIdNum), eq(folders.agentId, agentId)))
      .limit(1);

    if (!folderRows[0]) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Check if folder has any documents
    const docCountResult = await db
      .select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
      .from(documents)
      .where(eq(documents.folderId, folderIdNum));

    const docCount = docCountResult[0]?.count ?? 0;
    if (docCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete folder with documents',
        message: `This folder contains ${docCount} document(s). Please delete or move the documents first.`,
        documentCount: docCount
      });
    }

    // Check if folder has subfolders
    const subfolderCountResult = await db
      .select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
      .from(folders)
      .where(eq(folders.parentId, folderIdNum));

    const subfolderCount = subfolderCountResult[0]?.count ?? 0;
    if (subfolderCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete folder with subfolders',
        message: `This folder contains ${subfolderCount} subfolder(s). Please delete the subfolders first.`,
        subfolderCount: subfolderCount
      });
    }

    // Delete the folder (it's empty)
    await db.delete(folders).where(eq(folders.id, folderIdNum));

    res.json({ success: true, folderId: folderIdNum });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// ============================================================================
// Knowledge Base - Tag Routes
// ============================================================================

// List all tags for an agent
adminRouter.get('/agents/:agentId/tags', async (req, res) => {
  try {
    const { agentId } = req.params;

    // Get tags with document count
    const rows = await db
      .select({
        id: tags.id,
        agentId: tags.agentId,
        name: tags.name,
        color: tags.color,
        createdAt: tags.createdAt,
        documentCount: sql<number>`CAST(COUNT(${documentTags.documentId}) AS INTEGER)`,
      })
      .from(tags)
      .leftJoin(documentTags, eq(tags.id, documentTags.tagId))
      .where(eq(tags.agentId, agentId))
      .groupBy(tags.id)
      .orderBy(tags.name);

    res.json({ tags: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load tags' });
  }
});

// Create a tag
adminRouter.post('/agents/:agentId/tags', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { name, color } = req.body as { name: string; color?: string };

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }

    const inserted = await db
      .insert(tags)
      .values({
        agentId,
        name: name.trim(),
        color: color || '#6b7280',
      })
      .returning();

    res.json({ tag: inserted[0] });
  } catch (err: any) {
    // Handle unique constraint violation
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Tag with this name already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// Update a tag
adminRouter.put('/agents/:agentId/tags/:tagId', async (req, res) => {
  try {
    const { agentId, tagId } = req.params;
    const { name, color } = req.body as { name?: string; color?: string };

    const patch: any = {};
    if (typeof name === 'string') patch.name = name.trim();
    if (typeof color === 'string') patch.color = color;

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const updated = await db
      .update(tags)
      .set(patch)
      .where(and(eq(tags.id, parseInt(tagId)), eq(tags.agentId, agentId)))
      .returning();

    if (!updated[0]) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    res.json({ tag: updated[0] });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Tag with this name already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

// Delete a tag
adminRouter.delete('/agents/:agentId/tags/:tagId', async (req, res) => {
  try {
    const { agentId, tagId } = req.params;
    const tagIdNum = parseInt(tagId);

    // Delete the tag (cascades to document_tags junction)
    await db
      .delete(tags)
      .where(and(eq(tags.id, tagIdNum), eq(tags.agentId, agentId)));

    res.json({ success: true, tagId: tagIdNum });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// ============================================================================
// Knowledge Base - Document Management Routes
// ============================================================================

// Move a document to a folder
adminRouter.put('/agents/:agentId/documents/:docId/move', async (req, res) => {
  try {
    const { agentId, docId } = req.params;
    const { folderId } = req.body as { folderId: number | null };

    const updated = await db
      .update(documents)
      .set({ folderId: folderId || null })
      .where(and(eq(documents.id, parseInt(docId)), eq(documents.agentId, agentId)))
      .returning();

    if (!updated[0]) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ document: updated[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to move document' });
  }
});

// Change document category
adminRouter.put('/agents/:agentId/documents/:docId/category', async (req, res) => {
  try {
    const { agentId, docId } = req.params;
    const { category } = req.body as { category: 'knowledge' | 'code' | 'data' };

    const allowedCategories = ['knowledge', 'code', 'data'];
    if (!allowedCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category. Must be: knowledge, code, or data' });
    }

    const updated = await db
      .update(documents)
      .set({ category })
      .where(and(eq(documents.id, parseInt(docId)), eq(documents.agentId, agentId)))
      .returning();

    if (!updated[0]) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ document: updated[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Update document tags (replace all tags)
adminRouter.put('/agents/:agentId/documents/:docId/tags', async (req, res) => {
  try {
    const { agentId, docId } = req.params;
    const { tagIds } = req.body as { tagIds: number[] };
    const docIdNum = parseInt(docId);

    // Verify document exists and belongs to agent
    const docRows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, docIdNum), eq(documents.agentId, agentId)))
      .limit(1);

    if (!docRows[0]) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete existing tags for this document
    await db.delete(documentTags).where(eq(documentTags.documentId, docIdNum));

    // Insert new tags (if any)
    if (tagIds && tagIds.length > 0) {
      await db.insert(documentTags).values(
        tagIds.map((tagId) => ({
          documentId: docIdNum,
          tagId,
        }))
      );
    }

    // Get updated tags for the document
    const updatedTags = await db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
      })
      .from(tags)
      .innerJoin(documentTags, eq(tags.id, documentTags.tagId))
      .where(eq(documentTags.documentId, docIdNum));

    res.json({ tags: updatedTags });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update document tags' });
  }
});

// Get documents with folder/category/tag info
adminRouter.get('/agents/:agentId/documents', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { folderId, category } = req.query as { folderId?: string; category?: string };

    // Build query conditions
    const conditions = [eq(documents.agentId, agentId)];

    if (folderId === 'null' || folderId === 'root') {
      conditions.push(isNull(documents.folderId));
    } else if (folderId) {
      conditions.push(eq(documents.folderId, parseInt(folderId)));
    }

    if (category) {
      conditions.push(eq(documents.category, category));
    }

    const docs = await db
      .select()
      .from(documents)
      .where(and(...conditions))
      .orderBy(documents.title);

    // Get tags for each document
    const docsWithTags = await Promise.all(
      docs.map(async (doc: any) => {
        const docTags = await db
          .select({
            id: tags.id,
            name: tags.name,
            color: tags.color,
          })
          .from(tags)
          .innerJoin(documentTags, eq(tags.id, documentTags.tagId))
          .where(eq(documentTags.documentId, doc.id));

        return { ...doc, tags: docTags };
      })
    );

    res.json({ documents: docsWithTags });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load documents' });
  }
});

// Bulk apply category to multiple documents
adminRouter.post('/agents/:agentId/documents/bulk-category', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { documentIds, category } = req.body as { documentIds: number[]; category: string };

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'documentIds array is required' });
    }

    if (!category || typeof category !== 'string') {
      return res.status(400).json({ error: 'category is required' });
    }

    // Limit to 20 documents at a time
    if (documentIds.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 documents can be updated at once' });
    }

    // Update category for all matching documents
    await db
      .update(documents)
      .set({ category })
      .where(and(
        eq(documents.agentId, agentId),
        inArray(documents.id, documentIds)
      ));

    res.json({
      success: true,
      updatedCount: documentIds.length,
      category
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk apply category' });
  }
});

// Bulk delete documents
adminRouter.post('/agents/:agentId/documents/bulk-delete', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { documentIds } = req.body as { documentIds: number[] };

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'documentIds array is required' });
    }

    // Limit to 20 documents at a time
    if (documentIds.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 documents can be deleted at once' });
    }

    // Delete documents that belong to this agent
    await db
      .delete(documents)
      .where(and(
        eq(documents.agentId, agentId),
        inArray(documents.id, documentIds)
      ));

    res.json({ success: true, deletedCount: documentIds.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk delete documents' });
  }
});

// Get storage stats for an agent
adminRouter.get('/agents/:agentId/storage', async (req, res) => {
  try {
    const { agentId } = req.params;

    // Get basic stats
    const basicStats = await db
      .select({
        totalDocuments: sql<number>`CAST(COUNT(*) AS INTEGER)`,
        totalSize: sql<number>`COALESCE(SUM(${documents.size}), 0)`,
      })
      .from(documents)
      .where(eq(documents.agentId, agentId));

    // Get category breakdown with GROUP BY
    const categoryStats = await db
      .select({
        category: sql<string>`COALESCE(${documents.category}, 'knowledge')`,
        count: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      })
      .from(documents)
      .where(eq(documents.agentId, agentId))
      .groupBy(sql`COALESCE(${documents.category}, 'knowledge')`);

    // Convert to object
    const byCategory: Record<string, number> = {};
    for (const row of categoryStats) {
      byCategory[row.category] = row.count;
    }

    // Get folder count
    const folderCount = await db
      .select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
      .from(folders)
      .where(eq(folders.agentId, agentId));

    // Get tag count
    const tagCount = await db
      .select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
      .from(tags)
      .where(eq(tags.agentId, agentId));

    res.json({
      storage: {
        totalDocuments: basicStats[0]?.totalDocuments || 0,
        totalSize: basicStats[0]?.totalSize || 0,
        byCategory,
        folderCount: folderCount[0]?.count || 0,
        tagCount: tagCount[0]?.count || 0,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load storage stats' });
  }
});

// ============================================================================
// GitLab KB Refresh Routes
// ============================================================================

// Get GitLab connection config for an agent
adminRouter.get('/agents/:agentId/tools/gitlab', async (req, res) => {
  try {
    const { agentId } = req.params;
    const features = getFeatures();

    // Always return licensed status so frontend knows whether to show the UI
    if (!features.gitlabKbSync) {
      return res.json({ configured: false, licensed: false });
    }

    const connection = await getGitLabConnection(agentId);

    if (!connection) {
      return res.json({ configured: false, licensed: true });
    }

    // Get last refresh
    const history = await getRefreshHistory(agentId, 1);
    const lastRefresh = history.length > 0 ? history[0] : null;

    res.json({
      configured: true,
      licensed: true,
      projectUrl: connection.projectUrl,
      branch: connection.branch,
      pathFilter: connection.pathFilter,
      fileExtensions: connection.fileExtensions,
      convertAsciidoc: connection.convertAsciidoc,
      docsBaseUrl: connection.docsBaseUrl,
      productContext: connection.productContext,
      productMappings: connection.productMappings,
      lastRefresh,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get GitLab connection' });
  }
});

// Save/update GitLab connection config
adminRouter.post('/agents/:agentId/tools/gitlab', async (req, res) => {
  try {
    const features = getFeatures();
    if (!features.gitlabKbSync) {
      return res.status(403).json({
        error: 'GitLab KB Sync not licensed. Upgrade to enable this feature.',
      });
    }

    const { agentId } = req.params;
    const {
      projectUrl,
      accessToken,
      branch,
      pathFilter,
      fileExtensions,
      convertAsciidoc,
      docsBaseUrl,
      productContext,
      productMappings,
    } = req.body as {
      projectUrl: string;
      accessToken: string;
      branch?: string;
      pathFilter?: string;
      fileExtensions?: string[];
      convertAsciidoc?: boolean;
      docsBaseUrl?: string;
      productContext?: string;
      productMappings?: Record<string, string>;
    };

    if (!projectUrl || !accessToken) {
      return res.status(400).json({ error: 'projectUrl and accessToken are required' });
    }

    // Validate connection first
    const validation = await validateGitLabConnection({
      projectUrl,
      accessToken,
      branch: branch || 'main',
      pathFilter: pathFilter || '/',
      fileExtensions: fileExtensions || ['.md', '.adoc'],
      convertAsciidoc: convertAsciidoc !== false,
    });

    if (!validation.valid) {
      return res.status(400).json({ error: validation.error, validation });
    }

    // Save connection
    await saveGitLabConnection(agentId, {
      projectUrl,
      accessToken,
      branch: branch || 'main',
      pathFilter: pathFilter || '/',
      fileExtensions: fileExtensions || ['.md', '.adoc'],
      convertAsciidoc: convertAsciidoc !== false,
      docsBaseUrl,
      productContext,
      productMappings,
    });

    res.json({
      success: true,
      message: 'GitLab connection saved',
      validation,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save GitLab connection' });
  }
});

// Delete GitLab connection
adminRouter.delete('/agents/:agentId/tools/gitlab', async (req, res) => {
  try {
    const { agentId } = req.params;
    await deleteGitLabConnection(agentId);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete GitLab connection' });
  }
});

// Validate GitLab connection without saving
adminRouter.post('/agents/:agentId/tools/gitlab/validate', async (req, res) => {
  try {
    const features = getFeatures();
    if (!features.gitlabKbSync) {
      return res.status(403).json({
        error: 'GitLab KB Sync not licensed. Upgrade to enable this feature.',
      });
    }

    const {
      projectUrl,
      accessToken,
      branch,
      pathFilter,
      fileExtensions,
    } = req.body as {
      projectUrl: string;
      accessToken: string;
      branch?: string;
      pathFilter?: string;
      fileExtensions?: string[];
    };

    if (!projectUrl || !accessToken) {
      return res.status(400).json({ error: 'projectUrl and accessToken are required' });
    }

    const validation = await validateGitLabConnection({
      projectUrl,
      accessToken,
      branch: branch || 'main',
      pathFilter: pathFilter || '/',
      fileExtensions: fileExtensions || ['.md', '.adoc'],
      convertAsciidoc: true,
    });

    res.json(validation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to validate GitLab connection' });
  }
});

// Trigger a KB refresh from GitLab
adminRouter.post('/agents/:agentId/tools/gitlab/refresh', async (req, res) => {
  try {
    const features = getFeatures();
    if (!features.gitlabKbSync) {
      return res.status(403).json({
        error: 'GitLab KB Sync not licensed. Upgrade to enable this feature.',
      });
    }

    const { agentId } = req.params;

    // Check if connection exists
    const connection = await getGitLabConnection(agentId);
    if (!connection) {
      return res.status(400).json({ error: 'GitLab connection not configured' });
    }

    // Start refresh in background and return immediately
    res.json({
      message: 'Refresh started',
      status: 'running',
    });

    // Execute refresh (this will update the database as it progresses)
    executeRefresh(agentId).catch((err) => {
      console.error('Refresh error:', err);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start refresh' });
  }
});

// Get refresh status/history
adminRouter.get('/agents/:agentId/tools/gitlab/refreshes', async (req, res) => {
  try {
    const { agentId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const history = await getRefreshHistory(agentId, limit);
    res.json({ refreshes: history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get refresh history' });
  }
});

// Get specific refresh status
adminRouter.get('/agents/:agentId/tools/gitlab/refresh/:refreshId', async (req, res) => {
  try {
    const refreshId = parseInt(req.params.refreshId);
    const refresh = await getRefresh(refreshId);

    if (!refresh) {
      return res.status(404).json({ error: 'Refresh not found' });
    }

    res.json({ refresh });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get refresh status' });
  }
});

// Download archive from a refresh
adminRouter.get('/agents/:agentId/tools/gitlab/refreshes/:refreshId/download', async (req, res) => {
  try {
    const refreshId = parseInt(req.params.refreshId);
    const refresh = await getRefresh(refreshId);

    if (!refresh || !refresh.archivePath) {
      return res.status(404).json({ error: 'Archive not found' });
    }

    const archivePath = getArchivePath(refresh.archivePath);
    if (!archivePath) {
      return res.status(404).json({ error: 'Archive file not found' });
    }

    res.download(archivePath, path.basename(archivePath));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to download archive' });
  }
});

// Delete a refresh entry and its archive
adminRouter.delete('/agents/:agentId/tools/gitlab/refreshes/:refreshId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const refreshId = parseInt(req.params.refreshId);
    const refresh = await getRefresh(refreshId);

    if (!refresh) {
      return res.status(404).json({ error: 'Refresh not found' });
    }

    // Verify refresh belongs to this agent
    if (refresh.agentId !== agentId) {
      return res.status(403).json({ error: 'Refresh does not belong to this agent' });
    }

    // Delete archive file if exists
    if (refresh.archivePath) {
      const archivePath = getArchivePath(refresh.archivePath);
      if (archivePath && fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
      }
    }

    // Delete from database
    await deleteRefresh(refreshId);

    res.json({ success: true, message: 'Refresh entry deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete refresh' });
  }
});
