/**
 * MCP Server Manager
 *
 * Manages the lifecycle of external MCP servers, including:
 * - Registration from database configuration
 * - Starting/stopping servers
 * - Integration with the capability system
 */

import { db } from '../db/client';
import { capabilities, agentCapabilities, capabilityTokens } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { getOrchestrator } from './orchestrator';
import { StdioMCPServer, StdioMCPServerConfig } from './stdio-mcp-server';
import { MCPServerInstance } from './types';
import { anyapiServer } from './servers/anyapi';
import { ccviewServer } from './servers/ccview';
import { ccexplorerServer } from './servers/ccexplorer';
import { lighthouseServer } from './servers/lighthouse';

// Configuration for well-known MCP servers (npm packages)
export interface WellKnownMCPServer {
  id: string;
  name: string;
  description: string;
  npmPackage: string;
  category: string;
  envVars: Array<{
    name: string;
    label: string;
    required: boolean;
    tokenField: 'token1' | 'token2' | 'token3' | 'token4' | 'token5';
  }>;
}

// Registry of well-known MCP servers
export const WELL_KNOWN_MCP_SERVERS: WellKnownMCPServer[] = [
  {
    id: 'mcp-github',
    name: 'GitHub',
    description: 'Create repositories, manage issues, push files, search code, and more via GitHub API.',
    npmPackage: '@modelcontextprotocol/server-github',
    category: 'development',
    envVars: [
      { name: 'GITHUB_PERSONAL_ACCESS_TOKEN', label: 'GitHub Personal Access Token', required: true, tokenField: 'token1' },
    ],
  },
  {
    id: 'mcp-slack',
    name: 'Slack',
    description: 'Send messages, manage channels, and interact with Slack workspaces.',
    npmPackage: '@modelcontextprotocol/server-slack',
    category: 'communication',
    envVars: [
      { name: 'SLACK_BOT_TOKEN', label: 'Slack Bot Token', required: true, tokenField: 'token1' },
      { name: 'SLACK_TEAM_ID', label: 'Slack Team ID', required: false, tokenField: 'token2' },
    ],
  },
  {
    id: 'mcp-google-drive',
    name: 'Google Drive',
    description: 'Search, read, and manage files in Google Drive.',
    npmPackage: '@modelcontextprotocol/server-gdrive',
    category: 'storage',
    envVars: [
      { name: 'GOOGLE_APPLICATION_CREDENTIALS', label: 'Service Account JSON Path', required: true, tokenField: 'token1' },
    ],
  },
  {
    id: 'mcp-postgres',
    name: 'PostgreSQL',
    description: 'Read-only access to PostgreSQL databases for data analysis.',
    npmPackage: '@modelcontextprotocol/server-postgres',
    category: 'database',
    envVars: [
      { name: 'DATABASE_URL', label: 'PostgreSQL Connection URL', required: true, tokenField: 'token1' },
    ],
  },
  {
    id: 'mcp-filesystem',
    name: 'Filesystem',
    description: 'Secure file operations with configurable access controls.',
    npmPackage: '@modelcontextprotocol/server-filesystem',
    category: 'system',
    envVars: [],
  },
  {
    id: 'mcp-brave-search',
    name: 'Brave Search',
    description: 'Web search and local search via Brave Search API.',
    npmPackage: '@modelcontextprotocol/server-brave-search',
    category: 'search',
    envVars: [
      { name: 'BRAVE_API_KEY', label: 'Brave Search API Key', required: true, tokenField: 'token1' },
    ],
  },
  {
    id: 'mcp-puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation with screenshots, console logs, and page interaction.',
    npmPackage: '@modelcontextprotocol/server-puppeteer',
    category: 'automation',
    envVars: [],
  },
  {
    id: 'mcp-everart',
    name: 'EverArt',
    description: 'AI art generation with various models and styles.',
    npmPackage: '@modelcontextprotocol/server-everart',
    category: 'creative',
    envVars: [
      { name: 'EVERART_API_KEY', label: 'EverArt API Key', required: true, tokenField: 'token1' },
    ],
  },
  {
    id: 'mcp-sequential-thinking',
    name: 'Sequential Thinking',
    description: 'Dynamic, self-reflective reasoning tool for complex problem solving.',
    npmPackage: '@modelcontextprotocol/server-sequential-thinking',
    category: 'reasoning',
    envVars: [],
  },
  // ============================================================================
  // Canton Network MCP Servers (Custom - AgenticLedger) - BUNDLED
  // These are embedded directly in Agent-in-a-Box, not external npm packages
  // ============================================================================
  {
    id: 'mcp-ccview',
    name: 'CCView (Canton Explorer)',
    description: 'Query Canton Network via ccview.io API. 49 tools for governance, validators, ANS names, token transfers, offers, rewards, and network statistics.',
    npmPackage: '__bundled__', // Special flag: bundled server, not npm
    category: 'blockchain',
    envVars: [
      { name: 'CCVIEW_API_KEY', label: 'CCView API Key', required: true, tokenField: 'token1' },
    ],
  },
  {
    id: 'mcp-ccexplorer-pro',
    name: 'CC Explorer Pro (Canton)',
    description: 'Query Canton Network via CC Explorer Pro API. 14 tools for network overview, governance, validators, parties, contracts, and ledger updates.',
    npmPackage: '__bundled__', // Special flag: bundled server, not npm
    category: 'blockchain',
    envVars: [
      { name: 'CCEXPLORER_API_KEY', label: 'CC Explorer Pro API Key', required: true, tokenField: 'token1' },
    ],
  },
  {
    id: 'mcp-lighthouse',
    name: 'Lighthouse (CantonLoop)',
    description: 'Query Canton Network via Lighthouse Explorer (lighthouse.cantonloop.com). 28 tools for CNS, contracts, governance, validators, parties, prices, rounds, stats, transactions, transfers. NO API KEY REQUIRED.',
    npmPackage: '__bundled__', // Special flag: bundled server, not npm
    category: 'blockchain',
    envVars: [], // No API key required - public API
  },
];

export class MCPServerManager {
  private activeServers = new Map<string, MCPServerInstance>();
  private initialized = false;

  /**
   * Initialize the MCP Server Manager
   * - Seeds well-known MCP servers into capabilities table
   * - Starts AnyAPI server
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[mcp-manager] Initializing MCP Server Manager...');

    // Seed well-known MCP servers as capabilities
    await this.seedWellKnownServers();

    // Register all built-in (bundled) MCP servers
    const orchestrator = getOrchestrator();

    // 1. AnyAPI - Generic REST API caller
    await orchestrator.registerServer(anyapiServer);
    this.activeServers.set('anyapi', anyapiServer);
    console.log('[mcp-manager] Registered bundled server: anyapi');

    // 2. CCView - Canton Network Explorer (ccview.io)
    // API key will be configured when enabled for an agent via UI
    await orchestrator.registerServer(ccviewServer);
    this.activeServers.set('ccview', ccviewServer);
    console.log('[mcp-manager] Registered bundled server: ccview');

    // 3. CC Explorer Pro - Canton Network (pro.ccexplorer.io)
    // API key will be configured when enabled for an agent via UI
    await orchestrator.registerServer(ccexplorerServer);
    this.activeServers.set('ccexplorer', ccexplorerServer);
    console.log('[mcp-manager] Registered bundled server: ccexplorer');

    // 4. Lighthouse - Canton Network (lighthouse.cantonloop.com)
    // NO API key required - public API
    await orchestrator.registerServer(lighthouseServer);
    this.activeServers.set('lighthouse', lighthouseServer);
    console.log('[mcp-manager] Registered bundled server: lighthouse (no API key required)');

    // Load any existing API keys from database for bundled servers
    await this.loadBundledServerTokens();

    this.initialized = true;
    console.log('[mcp-manager] MCP Server Manager initialized with 4 bundled servers');
  }

  /**
   * Load existing tokens from database for bundled MCP servers
   */
  private async loadBundledServerTokens(): Promise<void> {
    try {
      // Import capability service here to avoid circular dependencies
      const { capabilityService } = await import('../capabilities');

      // Get tokens for bundled servers using the default-agent ID
      const bundledCapabilities = ['mcp-ccview', 'mcp-ccexplorer-pro'];
      const defaultAgentId = 'default-agent';

      for (const capId of bundledCapabilities) {
        const tokens = await capabilityService.getCapabilityTokens(defaultAgentId, capId);
        if (tokens?.token1) {
          this.configureBundledServer(capId, tokens.token1);
        }
      }
    } catch (error) {
      // Silently ignore - tokens may not exist yet (first run)
    }
  }

  /**
   * Seed well-known MCP servers into the capabilities table
   */
  private async seedWellKnownServers(): Promise<void> {
    for (const server of WELL_KNOWN_MCP_SERVERS) {
      const existing = await db.select().from(capabilities).where(eq(capabilities.id, server.id));

      if (existing.length === 0) {
        const hasRequiredEnvVars = server.envVars.some((e) => e.required);
        await db.insert(capabilities).values({
          id: server.id,
          name: server.name,
          description: server.description,
          type: 'mcp',
          category: server.category,
          enabled: 0, // Disabled by default
          config: {
            npmPackage: server.npmPackage,
            envVars: server.envVars,
            requiresAuth: hasRequiredEnvVars,
            tokenFields: server.envVars.map((e) => ({
              name: e.tokenField,
              label: e.label,
              required: e.required,
            })),
          },
        });
        console.log(`[mcp-manager] Seeded MCP server capability: ${server.name}`);
      }
    }
  }

  /**
   * Configure API key for a bundled MCP server
   */
  configureBundledServer(serverId: string, apiKey: string): void {
    switch (serverId) {
      case 'mcp-ccview':
        ccviewServer.setApiKey(apiKey);
        console.log(`[mcp-manager] Configured API key for ccview server`);
        break;
      case 'mcp-ccexplorer-pro':
        ccexplorerServer.setApiKey(apiKey);
        console.log(`[mcp-manager] Configured API key for ccexplorer server`);
        break;
      case 'mcp-lighthouse':
        // No API key required - public API
        console.log(`[mcp-manager] Lighthouse server uses public API (no key needed)`);
        break;
      default:
        console.warn(`[mcp-manager] Unknown bundled server: ${serverId}`);
    }
  }

  /**
   * Start an MCP server for a specific agent
   */
  async startServerForAgent(agentId: string, capabilityId: string): Promise<MCPServerInstance | null> {
    // Check if server is already running
    const serverKey = `${agentId}:${capabilityId}`;
    if (this.activeServers.has(serverKey)) {
      return this.activeServers.get(serverKey)!;
    }

    // Get capability config
    const capRows = await db.select().from(capabilities).where(eq(capabilities.id, capabilityId));
    const cap = capRows[0];

    if (!cap || cap.type !== 'mcp') {
      console.error(`[mcp-manager] Capability ${capabilityId} not found or not an MCP server`);
      return null;
    }

    const config = cap.config as { npmPackage?: string; envVars?: Array<{ name: string; tokenField: string }> };
    if (!config.npmPackage) {
      console.error(`[mcp-manager] Capability ${capabilityId} missing npmPackage config`);
      return null;
    }

    // Get tokens for this capability
    const tokenRows = await db
      .select()
      .from(capabilityTokens)
      .where(and(eq(capabilityTokens.agentId, agentId), eq(capabilityTokens.capabilityId, capabilityId)));

    const tokens = tokenRows[0];

    // Build environment variables
    const env: Record<string, string> = {};
    if (config.envVars && tokens) {
      for (const envVar of config.envVars) {
        const tokenValue = tokens[envVar.tokenField as keyof typeof tokens];
        if (tokenValue && typeof tokenValue === 'string') {
          // Note: tokens should be decrypted before use
          // For now, we'll pass them through - in production, decrypt first
          env[envVar.name] = tokenValue;
        }
      }
    }

    // Check if this is a bundled server (not an npm package)
    if (config.npmPackage === '__bundled__') {
      // Configure the bundled server with API key from the first env var
      const apiKey = Object.values(env)[0];
      if (apiKey) {
        this.configureBundledServer(capabilityId, apiKey);
      }

      // Return the appropriate bundled server instance
      switch (capabilityId) {
        case 'mcp-ccview':
          return ccviewServer;
        case 'mcp-ccexplorer-pro':
          return ccexplorerServer;
        case 'mcp-lighthouse':
          return lighthouseServer; // No API key needed
        default:
          console.error(`[mcp-manager] Unknown bundled server: ${capabilityId}`);
          return null;
      }
    }

    // Create stdio MCP server config for external npm packages
    const serverConfig: StdioMCPServerConfig = {
      id: serverKey,
      name: cap.name,
      description: cap.description || '',
      command: 'npx',
      args: ['-y', config.npmPackage],
      env,
    };

    try {
      const server = new StdioMCPServer(serverConfig);
      await server.initialize();

      // Register with orchestrator
      const orchestrator = getOrchestrator();
      await orchestrator.registerServer(server);

      this.activeServers.set(serverKey, server);
      console.log(`[mcp-manager] Started MCP server ${cap.name} for agent ${agentId}`);

      return server;
    } catch (error) {
      console.error(`[mcp-manager] Failed to start MCP server ${cap.name}:`, error);
      return null;
    }
  }

  /**
   * Stop an MCP server for a specific agent
   */
  async stopServerForAgent(agentId: string, capabilityId: string): Promise<void> {
    const serverKey = `${agentId}:${capabilityId}`;
    const server = this.activeServers.get(serverKey);

    if (server) {
      await server.shutdown();
      this.activeServers.delete(serverKey);
      console.log(`[mcp-manager] Stopped MCP server for ${agentId}:${capabilityId}`);
    }
  }

  /**
   * Start all enabled MCP servers for an agent
   */
  async startEnabledServersForAgent(agentId: string): Promise<void> {
    // Get enabled MCP capabilities for this agent
    const enabledCaps = await db
      .select({
        capabilityId: agentCapabilities.capabilityId,
        enabled: agentCapabilities.enabled,
      })
      .from(agentCapabilities)
      .where(eq(agentCapabilities.agentId, agentId));

    for (const cap of enabledCaps) {
      if (cap.enabled === 1) {
        await this.startServerForAgent(agentId, cap.capabilityId);
      }
    }
  }

  /**
   * Get all active servers for an agent
   */
  getActiveServersForAgent(agentId: string): MCPServerInstance[] {
    const servers: MCPServerInstance[] = [];

    for (const [key, server] of this.activeServers) {
      if (key.startsWith(`${agentId}:`)) {
        servers.push(server);
      }
    }

    return servers;
  }

  /**
   * Get all tools available to an agent (including external MCP servers)
   */
  async getToolsForAgent(agentId: string): Promise<Array<{ server: string; name: string; description: string }>> {
    const orchestrator = getOrchestrator();
    const allTools = orchestrator.getAllTools();

    // Filter to only include tools from servers this agent has access to
    const agentServers = this.getActiveServersForAgent(agentId);
    const agentServerNames = new Set(agentServers.map((s) => s.name));

    // Always include anyapi
    agentServerNames.add('anyapi');

    return allTools.filter((tool) => agentServerNames.has(tool.server));
  }

  /**
   * Execute a tool call for an agent
   */
  async executeToolForAgent(
    agentId: string,
    serverName: string,
    toolName: string,
    args: unknown
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const orchestrator = getOrchestrator();
    const result = await orchestrator.executeAction(serverName, toolName, args);
    return result;
  }

  /**
   * Get well-known MCP servers list
   */
  getWellKnownServers(): WellKnownMCPServer[] {
    return WELL_KNOWN_MCP_SERVERS;
  }

  /**
   * Add a custom MCP server (not from well-known list)
   */
  async addCustomServer(config: {
    id: string;
    name: string;
    description: string;
    command: string;
    args: string[];
    category?: string;
    envVars?: Array<{ name: string; label: string; required: boolean; tokenField: string }>;
  }): Promise<void> {
    await db.insert(capabilities).values({
      id: config.id,
      name: config.name,
      description: config.description,
      type: 'mcp',
      category: config.category || 'custom',
      enabled: 0,
      config: {
        command: config.command,
        args: config.args,
        envVars: config.envVars || [],
      },
    });
    console.log(`[mcp-manager] Added custom MCP server: ${config.name}`);
  }

  /**
   * Shutdown all active servers
   */
  async shutdown(): Promise<void> {
    console.log('[mcp-manager] Shutting down all MCP servers...');

    for (const [key, server] of this.activeServers) {
      try {
        await server.shutdown();
        console.log(`[mcp-manager] Shutdown: ${key}`);
      } catch (error) {
        console.error(`[mcp-manager] Error shutting down ${key}:`, error);
      }
    }

    this.activeServers.clear();
    this.initialized = false;
  }
}

// Singleton instance
let managerInstance: MCPServerManager | null = null;

export function getMCPServerManager(): MCPServerManager {
  if (!managerInstance) {
    managerInstance = new MCPServerManager();
  }
  return managerInstance;
}

export function resetMCPServerManager(): void {
  if (managerInstance) {
    managerInstance.shutdown().catch(console.error);
    managerInstance = null;
  }
}
