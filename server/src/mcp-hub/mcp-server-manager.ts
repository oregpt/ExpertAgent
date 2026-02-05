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
import { quickbooksServer } from './servers/quickbooks';
import { googleCalendarServer } from './servers/google-calendar';
import { slackServer } from './servers/slack';
import { notionServer } from './servers/notion';
import { googleSheetsServer } from './servers/google-sheets';
import { gmailServer } from './servers/gmail';
// New MCP servers
import { secEdgarServer } from './servers/sec-edgar';
import { bitwavePriceServer } from './servers/bitwave-price';
import { walletBalanceServer } from './servers/wallet-balance';
import { binanceUSServer } from './servers/binanceus';
import { krakenServer } from './servers/kraken';
import { coinbaseServer } from './servers/coinbase';
import { googleDocsServer } from './servers/google-docs';
import { plaidServer } from './servers/plaid';
import { kaikoServer } from './servers/kaiko';
import { theTieCantonServer } from './servers/thetie-canton';
import { chatScraperServer } from './servers/chatscraper';
import { gammaServer } from './servers/gamma';
import { faamTrackerServer } from './servers/faam-tracker';
import { traderServer } from './servers/trader';

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
    npmPackage: '__bundled__',
    category: 'blockchain',
    envVars: [],
  },
  // ============================================================================
  // Finance & Productivity MCP Servers (Custom - AgenticLedger) - BUNDLED
  // ============================================================================
  {
    id: 'quickbooks',
    name: 'QuickBooks Online',
    description: 'Query and manage QuickBooks Online data: customers, invoices, bills, accounts, payments, vendors, items, journal entries, and financial reports.',
    npmPackage: '__bundled__',
    category: 'finance',
    envVars: [
      { name: 'QBO_ACCESS_TOKEN', label: 'Access Token', required: true, tokenField: 'token1' },
      { name: 'QBO_REFRESH_TOKEN', label: 'Refresh Token', required: true, tokenField: 'token2' },
      { name: 'QBO_REALM_ID', label: 'Realm ID (Company ID)', required: true, tokenField: 'token3' },
      { name: 'QBO_CLIENT_ID', label: 'Client ID', required: true, tokenField: 'token4' },
      { name: 'QBO_CLIENT_SECRET', label: 'Client Secret', required: true, tokenField: 'token5' },
    ],
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    description: 'List, create, update, and search calendar events. Supports multiple calendars with OAuth2 auto-refresh.',
    npmPackage: '__bundled__',
    category: 'productivity',
    envVars: [
      { name: 'GCAL_ACCESS_TOKEN', label: 'Access Token', required: true, tokenField: 'token1' },
      { name: 'GCAL_REFRESH_TOKEN', label: 'Refresh Token', required: true, tokenField: 'token2' },
      { name: 'GCAL_CLIENT_ID', label: 'Client ID', required: true, tokenField: 'token3' },
      { name: 'GCAL_CLIENT_SECRET', label: 'Client Secret', required: true, tokenField: 'token4' },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'List channels, read/post messages, reply to threads, search messages, manage reactions, and get user info.',
    npmPackage: '__bundled__',
    category: 'communication',
    envVars: [
      { name: 'SLACK_BOT_TOKEN', label: 'Bot Token (xoxb-...)', required: true, tokenField: 'token1' },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Search, read, and manage Notion pages, databases, and blocks. Query databases with filters and sorts.',
    npmPackage: '__bundled__',
    category: 'productivity',
    envVars: [
      { name: 'NOTION_API_KEY', label: 'Integration Token', required: true, tokenField: 'token1' },
    ],
  },
  {
    id: 'sheets',
    name: 'Google Sheets',
    description: 'Read/write cell ranges, append rows, create spreadsheets, and list sheets. Supports OAuth2 with auto-refresh.',
    npmPackage: '__bundled__',
    category: 'productivity',
    envVars: [
      { name: 'GSHEETS_ACCESS_TOKEN', label: 'Access Token', required: true, tokenField: 'token1' },
      { name: 'GSHEETS_REFRESH_TOKEN', label: 'Refresh Token', required: true, tokenField: 'token2' },
      { name: 'GSHEETS_CLIENT_ID', label: 'Client ID', required: true, tokenField: 'token3' },
      { name: 'GSHEETS_CLIENT_SECRET', label: 'Client Secret', required: true, tokenField: 'token4' },
    ],
  },
  {
    id: 'email',
    name: 'Gmail',
    description: 'Search, read, send, and reply to emails. Manage labels, threads, and trash. Supports OAuth2 with auto-refresh.',
    npmPackage: '__bundled__',
    category: 'communication',
    envVars: [
      { name: 'GMAIL_ACCESS_TOKEN', label: 'Access Token', required: true, tokenField: 'token1' },
      { name: 'GMAIL_REFRESH_TOKEN', label: 'Refresh Token', required: true, tokenField: 'token2' },
      { name: 'GMAIL_CLIENT_ID', label: 'Client ID', required: true, tokenField: 'token3' },
      { name: 'GMAIL_CLIENT_SECRET', label: 'Client Secret', required: true, tokenField: 'token4' },
    ],
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

    // 5. QuickBooks Online
    await orchestrator.registerServer(quickbooksServer);
    this.activeServers.set('quickbooks', quickbooksServer);
    console.log('[mcp-manager] Registered bundled server: quickbooks');

    // 6. Google Calendar
    await orchestrator.registerServer(googleCalendarServer);
    this.activeServers.set('google-calendar', googleCalendarServer);
    console.log('[mcp-manager] Registered bundled server: google-calendar');

    // 7. Slack
    await orchestrator.registerServer(slackServer);
    this.activeServers.set('slack', slackServer);
    console.log('[mcp-manager] Registered bundled server: slack');

    // 8. Notion
    await orchestrator.registerServer(notionServer);
    this.activeServers.set('notion', notionServer);
    console.log('[mcp-manager] Registered bundled server: notion');

    // 9. Google Sheets
    await orchestrator.registerServer(googleSheetsServer);
    this.activeServers.set('google-sheets', googleSheetsServer);
    console.log('[mcp-manager] Registered bundled server: google-sheets');

    // 10. Gmail
    await orchestrator.registerServer(gmailServer);
    this.activeServers.set('gmail', gmailServer);
    console.log('[mcp-manager] Registered bundled server: gmail');

    // 11. SEC EDGAR (public API, no auth)
    await orchestrator.registerServer(secEdgarServer);
    this.activeServers.set('sec-edgar', secEdgarServer);
    console.log('[mcp-manager] Registered bundled server: sec-edgar');

    // 12. Bitwave Price
    await orchestrator.registerServer(bitwavePriceServer);
    this.activeServers.set('bitwave-price', bitwavePriceServer);
    console.log('[mcp-manager] Registered bundled server: bitwave-price');

    // 13. Wallet Balance
    await orchestrator.registerServer(walletBalanceServer);
    this.activeServers.set('wallet-balance', walletBalanceServer);
    console.log('[mcp-manager] Registered bundled server: wallet-balance');

    // 14. BinanceUS
    await orchestrator.registerServer(binanceUSServer);
    this.activeServers.set('binanceus', binanceUSServer);
    console.log('[mcp-manager] Registered bundled server: binanceus');

    // 15. Kraken
    await orchestrator.registerServer(krakenServer);
    this.activeServers.set('kraken', krakenServer);
    console.log('[mcp-manager] Registered bundled server: kraken');

    // 16. Coinbase
    await orchestrator.registerServer(coinbaseServer);
    this.activeServers.set('coinbase', coinbaseServer);
    console.log('[mcp-manager] Registered bundled server: coinbase');

    // 17. Google Docs
    await orchestrator.registerServer(googleDocsServer);
    this.activeServers.set('google-docs', googleDocsServer);
    console.log('[mcp-manager] Registered bundled server: google-docs');

    // 18. Plaid
    await orchestrator.registerServer(plaidServer);
    this.activeServers.set('plaid', plaidServer);
    console.log('[mcp-manager] Registered bundled server: plaid');

    // 19. Kaiko
    await orchestrator.registerServer(kaikoServer);
    this.activeServers.set('kaiko', kaikoServer);
    console.log('[mcp-manager] Registered bundled server: kaiko');

    // 20. TheTie Canton
    await orchestrator.registerServer(theTieCantonServer);
    this.activeServers.set('thetie-canton', theTieCantonServer);
    console.log('[mcp-manager] Registered bundled server: thetie-canton');

    // 21. ChatScraper
    await orchestrator.registerServer(chatScraperServer);
    this.activeServers.set('chatscraper', chatScraperServer);
    console.log('[mcp-manager] Registered bundled server: chatscraper');

    // 22. Gamma
    await orchestrator.registerServer(gammaServer);
    this.activeServers.set('gamma', gammaServer);
    console.log('[mcp-manager] Registered bundled server: gamma');

    // 23. FAAM Tracker
    await orchestrator.registerServer(faamTrackerServer);
    this.activeServers.set('faam-tracker', faamTrackerServer);
    console.log('[mcp-manager] Registered bundled server: faam-tracker');

    // 24. Trader
    await orchestrator.registerServer(traderServer);
    this.activeServers.set('trader', traderServer);
    console.log('[mcp-manager] Registered bundled server: trader');

    // Load any existing API keys from database for bundled servers
    await this.loadBundledServerTokens();

    this.initialized = true;
    console.log('[mcp-manager] MCP Server Manager initialized with 24 bundled servers');
  }

  /**
   * Load existing tokens from database for bundled MCP servers
   */
  private async loadBundledServerTokens(): Promise<void> {
    try {
      const { capabilityService } = await import('../capabilities');
      const defaultAgentId = 'default-agent';

      // Single-token servers (API key only)
      const singleTokenCaps = ['mcp-ccview', 'mcp-ccexplorer-pro', 'slack', 'notion', 'bitwave-price', 'wallet-balance', 'kaiko', 'thetie-canton', 'gamma', 'faam-tracker', 'trader'];
      for (const capId of singleTokenCaps) {
        const tokens = await capabilityService.getCapabilityTokens(defaultAgentId, capId);
        if (tokens?.token1) {
          this.configureBundledServer(capId, tokens.token1);
        }
      }

      // Multi-token servers (OAuth2 or dual-key auth)
      const multiTokenCaps = ['quickbooks', 'calendar', 'sheets', 'email', 'binanceus', 'kraken', 'coinbase', 'google-docs', 'plaid', 'chatscraper'];
      for (const capId of multiTokenCaps) {
        const tokens = await capabilityService.getCapabilityTokens(defaultAgentId, capId);
        if (tokens?.token1) {
          this.configureBundledServerTokens(capId, tokens);
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
   * Configure API key for a bundled MCP server (single-token servers)
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
        console.log(`[mcp-manager] Lighthouse server uses public API (no key needed)`);
        break;
      case 'slack':
        slackServer.setApiKey(apiKey);
        console.log(`[mcp-manager] Configured token for slack server`);
        break;
      case 'notion':
        notionServer.setApiKey(apiKey);
        console.log(`[mcp-manager] Configured token for notion server`);
        break;
      case 'bitwave-price':
        bitwavePriceServer.setApiKey(apiKey);
        console.log(`[mcp-manager] Configured API key for bitwave-price server`);
        break;
      case 'wallet-balance':
        walletBalanceServer.setApiKey(apiKey);
        console.log(`[mcp-manager] Configured API key for wallet-balance server`);
        break;
      case 'kaiko':
        kaikoServer.setApiKey(apiKey);
        console.log(`[mcp-manager] Configured API key for kaiko server`);
        break;
      case 'thetie-canton':
        theTieCantonServer.setApiKey(apiKey);
        console.log(`[mcp-manager] Configured API key for thetie-canton server`);
        break;
      case 'gamma':
        gammaServer.setApiKey(apiKey);
        console.log(`[mcp-manager] Configured API key for gamma server`);
        break;
      case 'faam-tracker':
        faamTrackerServer.setApiKey(apiKey);
        console.log(`[mcp-manager] Configured API key for faam-tracker server`);
        break;
      case 'trader':
        traderServer.setApiKey(apiKey);
        console.log(`[mcp-manager] Configured API key for trader server`);
        break;
      default:
        console.warn(`[mcp-manager] Unknown bundled server: ${serverId}`);
    }
  }

  /**
   * Configure multi-token OAuth servers
   */
  configureBundledServerTokens(serverId: string, tokens: { token1?: string; token2?: string; token3?: string; token4?: string; token5?: string }): void {
    switch (serverId) {
      case 'quickbooks':
        quickbooksServer.setTokens(tokens);
        console.log(`[mcp-manager] Configured OAuth tokens for quickbooks server`);
        break;
      case 'calendar':
        googleCalendarServer.setTokens(tokens);
        console.log(`[mcp-manager] Configured OAuth tokens for google-calendar server`);
        break;
      case 'sheets':
        googleSheetsServer.setTokens(tokens);
        console.log(`[mcp-manager] Configured OAuth tokens for google-sheets server`);
        break;
      case 'email':
        gmailServer.setTokens(tokens);
        console.log(`[mcp-manager] Configured OAuth tokens for gmail server`);
        break;
      case 'binanceus':
        binanceUSServer.setTokens(tokens);
        console.log(`[mcp-manager] Configured API credentials for binanceus server`);
        break;
      case 'kraken':
        krakenServer.setTokens(tokens);
        console.log(`[mcp-manager] Configured API credentials for kraken server`);
        break;
      case 'coinbase':
        coinbaseServer.setTokens(tokens);
        console.log(`[mcp-manager] Configured API credentials for coinbase server`);
        break;
      case 'google-docs':
        googleDocsServer.setTokens(tokens);
        console.log(`[mcp-manager] Configured OAuth tokens for google-docs server`);
        break;
      case 'plaid':
        plaidServer.setTokens(tokens);
        console.log(`[mcp-manager] Configured tokens for plaid server`);
        break;
      case 'chatscraper':
        chatScraperServer.setTokens(tokens);
        console.log(`[mcp-manager] Configured tokens for chatscraper server`);
        break;
      default:
        console.warn(`[mcp-manager] Unknown multi-token server: ${serverId}`);
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

      // Multi-token bundled servers — pass all tokens
      const multiTokenServers = ['quickbooks', 'calendar', 'sheets', 'email'];
      if (multiTokenServers.includes(capabilityId)) {
        this.configureBundledServerTokens(capabilityId, env as any);
      }

      // Return the appropriate bundled server instance
      const bundledServerMap: Record<string, MCPServerInstance> = {
        'mcp-ccview': ccviewServer,
        'mcp-ccexplorer-pro': ccexplorerServer,
        'mcp-lighthouse': lighthouseServer,
        'quickbooks': quickbooksServer,
        'calendar': googleCalendarServer,
        'slack': slackServer,
        'notion': notionServer,
        'sheets': googleSheetsServer,
        'email': gmailServer,
      };

      const bundledServer = bundledServerMap[capabilityId];
      if (bundledServer) return bundledServer;

      console.error(`[mcp-manager] Unknown bundled server: ${capabilityId}`);
      return null;
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
