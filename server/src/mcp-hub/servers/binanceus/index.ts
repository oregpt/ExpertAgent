/**
 * BinanceUS MCP Server - HMAC Authentication
 */

import crypto from 'crypto';
import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';

const BASE_URL = 'https://api.binance.us';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, any>; required: string[] };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'get_account_info',
    description: 'Get account information including balances for all assets',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_balance',
    description: 'Get the balance of a specific asset',
    inputSchema: {
      type: 'object',
      properties: { asset: { type: 'string', description: 'Asset symbol (e.g., BTC, ETH, USD)' } },
      required: ['asset'],
    },
  },
  {
    name: 'get_trades',
    description: 'Get recent trades for a trading pair',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Trading pair (e.g., BTCUSD, ETHUSD)' },
        limit: { type: 'number', description: 'Number of trades to return (default: 50, max: 1000)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_deposits',
    description: 'Get deposit history',
    inputSchema: {
      type: 'object',
      properties: {
        asset: { type: 'string', description: 'Filter by asset (optional)' },
        limit: { type: 'number', description: 'Number of records (default: 100)' },
      },
      required: [],
    },
  },
  {
    name: 'get_withdrawals',
    description: 'Get withdrawal history',
    inputSchema: {
      type: 'object',
      properties: {
        asset: { type: 'string', description: 'Filter by asset (optional)' },
        limit: { type: 'number', description: 'Number of records (default: 100)' },
      },
      required: [],
    },
  },
  {
    name: 'get_ticker_price',
    description: 'Get current price for a symbol (public, no auth required)',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Trading pair (e.g., BTCUSD)' } },
      required: ['symbol'],
    },
  },
];

export class BinanceUSMCPServer implements MCPServerInstance {
  name = 'binanceus';
  version = '1.0.0';
  description = 'BinanceUS - Access Binance US exchange for balances, trades, deposits, and withdrawals.';
  tools: MCPTool[] = [];
  private apiKey?: string;
  private apiSecret?: string;

  setTokens(tokens: { token1?: string; token2?: string }): void {
    this.apiKey = tokens.token1;
    this.apiSecret = tokens.token2;
    console.log('[binanceus] API credentials configured');
  }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((t) => this.convertTool(t));
    console.log(`[binanceus] Initialized with ${this.tools.length} tools`);
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

  private sign(queryString: string): string {
    if (!this.apiSecret) throw new Error('API secret not configured');
    return crypto.createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
  }

  private async publicRequest(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) url.searchParams.append(k, String(v)); });
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`BinanceUS API error ${res.status}`);
    return res.json();
  }

  private async signedRequest(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('BinanceUS API credentials not configured. Add API key and secret in Capabilities settings.');
    }
    params.timestamp = Date.now();
    const queryString = Object.entries(params).filter(([_, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
    const signature = this.sign(queryString);
    const url = `${BASE_URL}${endpoint}?${queryString}&signature=${signature}`;
    const res = await fetch(url, { headers: { 'X-MBX-APIKEY': this.apiKey } });
    if (!res.ok) throw new Error(`BinanceUS API error ${res.status}`);
    return res.json();
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    try {
      switch (name) {
        case 'get_account_info': {
          const data = await this.signedRequest('/api/v3/account');
          const nonZeroBalances = data.balances?.filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0) || [];
          return {
            success: true,
            data: {
              accountType: data.accountType,
              canTrade: data.canTrade,
              balances: nonZeroBalances.map((b: any) => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked), total: parseFloat(b.free) + parseFloat(b.locked) })),
            },
          };
        }
        case 'get_balance': {
          const asset = (args.asset as string).toUpperCase();
          const data = await this.signedRequest('/api/v3/account');
          const balance = data.balances?.find((b: any) => b.asset === asset);
          if (!balance) return { success: true, data: { asset, free: 0, locked: 0, total: 0, found: false } };
          return { success: true, data: { asset: balance.asset, free: parseFloat(balance.free), locked: parseFloat(balance.locked), total: parseFloat(balance.free) + parseFloat(balance.locked), found: true } };
        }
        case 'get_trades': {
          const symbol = (args.symbol as string).toUpperCase();
          const limit = Math.min(Number(args.limit) || 50, 1000);
          const data = await this.signedRequest('/api/v3/myTrades', { symbol, limit });
          return {
            success: true,
            data: {
              symbol,
              trades: data.map((t: any) => ({ id: t.id, price: parseFloat(t.price), qty: parseFloat(t.qty), commission: parseFloat(t.commission), commissionAsset: t.commissionAsset, time: new Date(t.time).toISOString(), isBuyer: t.isBuyer })),
              count: data.length,
            },
          };
        }
        case 'get_deposits': {
          const params: Record<string, any> = { limit: Math.min(Number(args.limit) || 100, 1000) };
          if (args.asset) params.coin = (args.asset as string).toUpperCase();
          const data = await this.signedRequest('/sapi/v1/capital/deposit/hisrec', params);
          return { success: true, data: { deposits: data.map((d: any) => ({ amount: parseFloat(d.amount), coin: d.coin, network: d.network, status: d.status, txId: d.txId, insertTime: new Date(d.insertTime).toISOString() })), count: data.length } };
        }
        case 'get_withdrawals': {
          const params: Record<string, any> = { limit: Math.min(Number(args.limit) || 100, 1000) };
          if (args.asset) params.coin = (args.asset as string).toUpperCase();
          const data = await this.signedRequest('/sapi/v1/capital/withdraw/history', params);
          return { success: true, data: { withdrawals: data.map((w: any) => ({ amount: parseFloat(w.amount), transactionFee: parseFloat(w.transactionFee), coin: w.coin, status: w.status, txId: w.txId, applyTime: w.applyTime })), count: data.length } };
        }
        case 'get_ticker_price': {
          const symbol = (args.symbol as string).toUpperCase();
          const data = await this.publicRequest('/api/v3/ticker/price', { symbol });
          return { success: true, data: { symbol: data.symbol, price: parseFloat(data.price), timestamp: new Date().toISOString() } };
        }
        default: return { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
  }
}

export const binanceUSServer = new BinanceUSMCPServer();
