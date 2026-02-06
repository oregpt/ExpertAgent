/**
 * Kaiko MCP Server - Institutional-grade crypto market data
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';

const BASE_URL = 'https://us.market-api.kaiko.io/v2';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, any>; required: string[] };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'get_direct_price',
    description: 'Get direct exchange rate between two assets from a specific exchange',
    inputSchema: {
      type: 'object',
      properties: {
        baseAsset: { type: 'string', description: 'Base asset symbol (e.g., btc, eth)' },
        quoteAsset: { type: 'string', description: 'Quote asset symbol (e.g., usd, usdt)' },
        exchange: { type: 'string', description: 'Exchange code (e.g., cbse, krkn, bnce)' },
      },
      required: ['baseAsset', 'quoteAsset'],
    },
  },
  {
    name: 'get_vwap',
    description: 'Get volume-weighted average price across exchanges',
    inputSchema: {
      type: 'object',
      properties: {
        baseAsset: { type: 'string', description: 'Base asset symbol' },
        quoteAsset: { type: 'string', description: 'Quote asset symbol' },
        interval: { type: 'string', description: 'Time interval (1m, 5m, 15m, 1h, 1d)' },
      },
      required: ['baseAsset', 'quoteAsset'],
    },
  },
  {
    name: 'get_ohlcv',
    description: 'Get OHLCV (candlestick) data for a trading pair',
    inputSchema: {
      type: 'object',
      properties: {
        baseAsset: { type: 'string', description: 'Base asset symbol' },
        quoteAsset: { type: 'string', description: 'Quote asset symbol' },
        exchange: { type: 'string', description: 'Exchange code' },
        interval: { type: 'string', description: 'Candle interval (1m, 5m, 15m, 1h, 1d)' },
      },
      required: ['baseAsset', 'quoteAsset', 'exchange'],
    },
  },
  {
    name: 'get_trades',
    description: 'Get recent trades for a trading pair',
    inputSchema: {
      type: 'object',
      properties: {
        baseAsset: { type: 'string', description: 'Base asset symbol' },
        quoteAsset: { type: 'string', description: 'Quote asset symbol' },
        exchange: { type: 'string', description: 'Exchange code' },
        limit: { type: 'number', description: 'Number of trades (default: 100)' },
      },
      required: ['baseAsset', 'quoteAsset', 'exchange'],
    },
  },
];

export class KaikoMCPServer implements MCPServerInstance {
  name = 'kaiko';
  version = '1.0.0';
  description = 'Kaiko - Institutional-grade crypto market data: prices, VWAP, OHLCV, and trades.';
  tools: MCPTool[] = [];
  private apiKey?: string;

  setApiKey(key: string): void {
    this.apiKey = key;
    console.log('[kaiko] API key configured');
  }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((t) => this.convertTool(t));
    console.log(`[kaiko] Initialized with ${this.tools.length} tools`);
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
    if (!this.apiKey) throw new Error('Kaiko not configured. Add API key in Capabilities settings.');
    const res = await fetch(`${BASE_URL}${endpoint}`, { headers: { 'X-Api-Key': this.apiKey, 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`Kaiko API error ${res.status}`);
    return res.json();
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    try {
      switch (name) {
        case 'get_direct_price': {
          const baseAsset = (args.baseAsset as string).toLowerCase();
          const quoteAsset = (args.quoteAsset as string).toLowerCase();
          const interval = (args.interval as string) || '1d';
          // Use robust_pair_price endpoint (works with Canton CC data)
          const data = await this.request(`/data/trades.v1/robust_pair_price/${baseAsset}/${quoteAsset}?interval=${interval}`);
          return { success: true, data: { baseAsset, quoteAsset, interval, price: data.data?.[0]?.price, volume: data.data?.[0]?.volume, timestamp: data.data?.[0]?.timestamp } };
        }
        case 'get_vwap': {
          const baseAsset = (args.baseAsset as string).toLowerCase();
          const quoteAsset = (args.quoteAsset as string).toLowerCase();
          const interval = (args.interval as string) || '1h';
          const data = await this.request(`/data/trades.v1/spot_exchange_rate/${baseAsset}/${quoteAsset}?interval=${interval}`);
          return { success: true, data: { baseAsset, quoteAsset, interval, vwap: data.data?.slice(-5) } };
        }
        case 'get_ohlcv': {
          const baseAsset = (args.baseAsset as string).toLowerCase();
          const quoteAsset = (args.quoteAsset as string).toLowerCase();
          const exchange = (args.exchange as string).toLowerCase();
          const interval = (args.interval as string) || '1h';
          const data = await this.request(`/data/trades.v1/exchanges/${exchange}/spots/${baseAsset}-${quoteAsset}/aggregations/ohlcv?interval=${interval}`);
          return { success: true, data: { baseAsset, quoteAsset, exchange, interval, candles: data.data?.slice(-10) } };
        }
        case 'get_trades': {
          const baseAsset = (args.baseAsset as string).toLowerCase();
          const quoteAsset = (args.quoteAsset as string).toLowerCase();
          const exchange = (args.exchange as string).toLowerCase();
          const limit = Number(args.limit) || 100;
          const data = await this.request(`/data/trades.v1/exchanges/${exchange}/spots/${baseAsset}-${quoteAsset}/trades?page_size=${limit}`);
          return { success: true, data: { baseAsset, quoteAsset, exchange, trades: data.data?.map((t: any) => ({ price: t.price, amount: t.amount, timestamp: t.timestamp, side: t.taker_side_sell ? 'sell' : 'buy' })) } };
        }
        default: return { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
  }
}

export const kaikoServer = new KaikoMCPServer();
