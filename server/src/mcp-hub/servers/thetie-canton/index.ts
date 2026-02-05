/**
 * TheTie Canton MCP Server - Canton Network analytics
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';

const BASE_URL = 'https://api-thetie.io';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, any>; required: string[] };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'get_cumulative_metrics',
    description: 'Get cumulative network metrics (total supply, rewards, wallets)',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_highlight_metrics',
    description: 'Get highlighted network performance metrics',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_validator_leaderboard',
    description: 'Get top validators by stake and rewards',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Number of validators (default: 20)' } },
      required: [],
    },
  },
  {
    name: 'get_cumulative_validators',
    description: 'Get cumulative validator count over time',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_holder_leaderboard',
    description: 'Get top CC token holders',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Number of holders (default: 20)' } },
      required: [],
    },
  },
  {
    name: 'get_reward_leaderboard',
    description: 'Get top reward earners',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_daily_active_users',
    description: 'Get daily active user metrics',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_transaction_count',
    description: 'Get transaction count metrics',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

export class TheTieCantonMCPServer implements MCPServerInstance {
  name = 'thetie-canton';
  version = '1.0.0';
  description = 'TheTie Canton - Canton Network analytics: validators, rewards, holders, transactions.';
  tools: MCPTool[] = [];
  private apiKey?: string;

  setApiKey(key: string): void {
    this.apiKey = key;
    console.log('[thetie-canton] API key configured');
  }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((t) => this.convertTool(t));
    console.log(`[thetie-canton] Initialized with ${this.tools.length} tools`);
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

  private async request(endpoint: string): Promise<any> {
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (this.apiKey) headers['x-api-key'] = this.apiKey;
    const res = await fetch(`${BASE_URL}${endpoint}`, { headers });
    if (!res.ok) throw new Error(`TheTie API error ${res.status}`);
    return res.json();
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    try {
      // All endpoints use /v3/integrations/canton/ prefix
      const prefix = '/v3/integrations/canton';
      switch (name) {
        case 'get_cumulative_metrics': {
          const data = await this.request(`${prefix}/cumulative-metrics`);
          return { success: true, data };
        }
        case 'get_highlight_metrics': {
          const data = await this.request(`${prefix}/highlight-metrics`);
          return { success: true, data };
        }
        case 'get_validator_leaderboard': {
          const limit = Number(args.limit) || 20;
          const data = await this.request(`${prefix}/validator-leaderboard?limit=${limit}`);
          return { success: true, data };
        }
        case 'get_cumulative_validators': {
          const data = await this.request(`${prefix}/cumulative-validators`);
          return { success: true, data };
        }
        case 'get_holder_leaderboard': {
          const limit = Number(args.limit) || 20;
          const data = await this.request(`${prefix}/holder-leaderboard?limit=${limit}`);
          return { success: true, data };
        }
        case 'get_reward_leaderboard': {
          const data = await this.request(`${prefix}/reward-leaderboard`);
          return { success: true, data };
        }
        case 'get_daily_active_users': {
          const data = await this.request(`${prefix}/daily-active-users`);
          return { success: true, data };
        }
        case 'get_transaction_count': {
          const data = await this.request(`${prefix}/transaction-count`);
          return { success: true, data };
        }
        default: return { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
  }
}

export const theTieCantonServer = new TheTieCantonMCPServer();
