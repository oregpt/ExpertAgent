/**
 * Bitwave Price MCP Server
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';

const BASE_URL = 'https://bitwave-price-service-794628893589.us-central1.run.app';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, any>; required: string[] };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'get_price',
    description: 'Get the current price of a cryptocurrency asset',
    inputSchema: {
      type: 'object',
      properties: {
        asset: { type: 'string', description: 'Asset symbol (e.g., BTC, ETH, SOL)' },
        currency: { type: 'string', description: 'Quote currency (default: USD)' },
        date: { type: 'string', description: 'Historical date (YYYY-MM-DD). Omit for current.' },
      },
      required: ['asset'],
    },
  },
  {
    name: 'list_supported_assets',
    description: 'List all supported cryptocurrency assets',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_batch_prices',
    description: 'Get prices for multiple assets at once',
    inputSchema: {
      type: 'object',
      properties: {
        assets: { type: 'array', description: 'Array of asset symbols' },
        currency: { type: 'string', description: 'Quote currency (default: USD)' },
      },
      required: ['assets'],
    },
  },
];

export class BitwavePriceMCPServer implements MCPServerInstance {
  name = 'bitwave-price';
  version = '1.0.0';
  description = 'Bitwave Price Service - Get cryptocurrency prices for accounting.';
  tools: MCPTool[] = [];
  private apiKey?: string;

  setApiKey(key: string): void { this.apiKey = key; }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((t) => this.convertTool(t));
    console.log(`[bitwave-price] Initialized with ${this.tools.length} tools`);
  }

  async shutdown(): Promise<void> {}
  async listTools(): Promise<MCPTool[]> { return this.tools; }

  private convertTool(tool: ToolDefinition): MCPTool {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, prop] of Object.entries(tool.inputSchema.properties || {})) {
      let field: z.ZodTypeAny = prop.type === 'number' ? z.number() : prop.type === 'array' ? z.array(z.string()) : z.string();
      if (!tool.inputSchema.required?.includes(key)) field = field.optional();
      shape[key] = field;
    }
    return { name: tool.name, description: tool.description, inputSchema: z.object(shape) };
  }

  private async request(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) url.searchParams.append(k, String(v)); });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) throw new Error(`Bitwave API error ${res.status}`);
    return res.json();
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    try {
      switch (name) {
        case 'get_price': {
          const asset = (args.asset as string).toUpperCase();
          const currency = ((args.currency as string) || 'USD').toUpperCase();
          const params: Record<string, any> = { asset, currency };
          if (args.date) params.date = args.date;
          const data = await this.request('/price', params);
          return { success: true, data: { asset, price: data.price, currency, timestamp: data.timestamp || new Date().toISOString() } };
        }
        case 'list_supported_assets': {
          const data = await this.request('/assets');
          return { success: true, data: { count: data.assets?.length || 0, assets: data.assets || [] } };
        }
        case 'get_batch_prices': {
          const assets = args.assets as string[];
          const currency = ((args.currency as string) || 'USD').toUpperCase();
          const prices = await Promise.all(assets.map(async (a) => {
            try {
              const data = await this.request('/price', { asset: a.toUpperCase(), currency });
              return { asset: a.toUpperCase(), price: data.price, currency };
            } catch (err) { return { asset: a.toUpperCase(), error: String(err) }; }
          }));
          return { success: true, data: { timestamp: new Date().toISOString(), currency, prices } };
        }
        default: return { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
  }
}

export const bitwavePriceServer = new BitwavePriceMCPServer();
