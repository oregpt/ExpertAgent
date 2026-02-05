/**
 * AgenticLedger Trader MCP Server - Automated trading campaigns
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';

const BASE_URL = 'https://trader.agenticledger.ai';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, any>; required: string[] };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'get_campaigns',
    description: 'List all trading campaigns',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_campaign',
    description: 'Get details of a specific trading campaign',
    inputSchema: {
      type: 'object',
      properties: { campaignId: { type: 'string', description: 'Campaign ID' } },
      required: ['campaignId'],
    },
  },
  {
    name: 'create_campaign',
    description: 'Create a new trading campaign',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Campaign name' },
        strategy: { type: 'string', description: 'Trading strategy (dca, grid, twap)' },
        asset: { type: 'string', description: 'Asset to trade' },
        exchange: { type: 'string', description: 'Exchange to use' },
        amount: { type: 'number', description: 'Total amount to trade' },
      },
      required: ['name', 'strategy', 'asset', 'exchange', 'amount'],
    },
  },
  {
    name: 'get_dashboard',
    description: 'Get trading dashboard overview',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_strategies',
    description: 'List available trading strategies',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_exchange_balance',
    description: 'Get exchange balance for trading',
    inputSchema: {
      type: 'object',
      properties: { exchange: { type: 'string', description: 'Exchange name' } },
      required: ['exchange'],
    },
  },
  {
    name: 'start_campaign',
    description: 'Start a paused or created campaign',
    inputSchema: {
      type: 'object',
      properties: { campaignId: { type: 'string', description: 'Campaign ID' } },
      required: ['campaignId'],
    },
  },
  {
    name: 'pause_campaign',
    description: 'Pause an active campaign',
    inputSchema: {
      type: 'object',
      properties: { campaignId: { type: 'string', description: 'Campaign ID' } },
      required: ['campaignId'],
    },
  },
];

export class TraderMCPServer implements MCPServerInstance {
  name = 'trader';
  version = '1.0.0';
  description = 'AgenticLedger Trader - Manage automated trading campaigns with DCA, grid, and TWAP strategies.';
  tools: MCPTool[] = [];
  private apiKey?: string;

  setApiKey(key: string): void {
    this.apiKey = key;
    console.log('[trader] API key configured');
  }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((t) => this.convertTool(t));
    console.log(`[trader] Initialized with ${this.tools.length} tools`);
  }

  async shutdown(): Promise<void> {}
  async listTools(): Promise<MCPTool[]> { return this.tools; }

  private convertTool(tool: ToolDefinition): MCPTool {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, prop] of Object.entries(tool.inputSchema.properties || {})) {
      let field: z.ZodTypeAny = prop.type === 'number' ? z.number() : z.string();
      if (!tool.inputSchema.required?.includes(key)) field = field.optional();
      shape[key] = field;
    }
    return { name: tool.name, description: tool.description, inputSchema: z.object(shape) };
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    if (!this.apiKey) throw new Error('Trader not configured. Add API key in Capabilities settings.');
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', ...options.headers },
    });
    if (!res.ok) throw new Error(`Trader API error ${res.status}`);
    return res.json();
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    try {
      switch (name) {
        case 'get_campaigns': {
          const data = await this.request('/campaigns');
          return { success: true, data: { campaigns: data.campaigns || data } };
        }
        case 'get_campaign': {
          const campaignId = args.campaignId as string;
          const data = await this.request(`/campaigns/${campaignId}`);
          return { success: true, data };
        }
        case 'create_campaign': {
          const body = { name: args.name, strategy: args.strategy, asset: args.asset, exchange: args.exchange, amount: args.amount };
          const data = await this.request('/campaigns', { method: 'POST', body: JSON.stringify(body) });
          return { success: true, data: { campaignId: data.id, status: data.status } };
        }
        case 'get_dashboard': {
          const data = await this.request('/dashboard');
          return { success: true, data };
        }
        case 'get_strategies': {
          const data = await this.request('/strategies');
          return { success: true, data: { strategies: data.strategies || data } };
        }
        case 'get_exchange_balance': {
          const exchange = args.exchange as string;
          const data = await this.request(`/exchanges/${exchange}/balance`);
          return { success: true, data };
        }
        case 'start_campaign': {
          const campaignId = args.campaignId as string;
          const data = await this.request(`/campaigns/${campaignId}/start`, { method: 'POST' });
          return { success: true, data: { campaignId, status: data.status } };
        }
        case 'pause_campaign': {
          const campaignId = args.campaignId as string;
          const data = await this.request(`/campaigns/${campaignId}/pause`, { method: 'POST' });
          return { success: true, data: { campaignId, status: data.status } };
        }
        default: return { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
  }
}

export const traderServer = new TraderMCPServer();
