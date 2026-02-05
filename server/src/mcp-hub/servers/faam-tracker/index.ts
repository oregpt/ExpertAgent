/**
 * FAAM Tracker MCP Server - Financial Asset Activity Monitor
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';

const BASE_URL = 'https://faam-tracker.agenticledger.ai';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, any>; required: string[] };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'get_stats',
    description: 'Get overall FAAM tracking statistics',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_transactions',
    description: 'Get tracked transactions',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: { type: 'string', description: 'Filter by wallet address' },
        asset: { type: 'string', description: 'Filter by asset symbol' },
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        limit: { type: 'number', description: 'Number of transactions (default: 50)' },
      },
      required: [],
    },
  },
  {
    name: 'get_wallets',
    description: 'List tracked wallets',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_assets',
    description: 'List tracked assets',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

export class FAAMTrackerMCPServer implements MCPServerInstance {
  name = 'faam-tracker';
  version = '1.0.0';
  description = 'FAAM Tracker - Monitor financial asset activity and transactions.';
  tools: MCPTool[] = [];
  private apiKey?: string;

  setApiKey(key: string): void {
    this.apiKey = key;
    console.log('[faam-tracker] API key configured');
  }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((t) => this.convertTool(t));
    console.log(`[faam-tracker] Initialized with ${this.tools.length} tools`);
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

  private async request(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) url.searchParams.append(k, String(v)); });
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) throw new Error(`FAAM Tracker API error ${res.status}`);
    return res.json();
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    try {
      switch (name) {
        case 'get_stats': {
          const data = await this.request('/stats');
          return { success: true, data };
        }
        case 'get_transactions': {
          const params: Record<string, any> = { limit: Number(args.limit) || 50 };
          if (args.wallet) params.wallet = args.wallet;
          if (args.asset) params.asset = args.asset;
          if (args.startDate) params.startDate = args.startDate;
          if (args.endDate) params.endDate = args.endDate;
          const data = await this.request('/transactions', params);
          return { success: true, data: { transactions: data.transactions || data, count: data.count || data.length } };
        }
        case 'get_wallets': {
          const data = await this.request('/wallets');
          return { success: true, data: { wallets: data.wallets || data } };
        }
        case 'get_assets': {
          const data = await this.request('/assets');
          return { success: true, data: { assets: data.assets || data } };
        }
        default: return { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
  }
}

export const faamTrackerServer = new FAAMTrackerMCPServer();
