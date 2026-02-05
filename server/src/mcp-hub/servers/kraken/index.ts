/**
 * Kraken MCP Server - HMAC Authentication
 */

import crypto from 'crypto';
import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';

const BASE_URL = 'https://api.kraken.com';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, any>; required: string[] };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'get_account_balance',
    description: 'Get account balance for all assets',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_trade_balance',
    description: 'Get trade balance (equity, margin, etc.)',
    inputSchema: {
      type: 'object',
      properties: { asset: { type: 'string', description: 'Base asset for calculations (default: ZUSD)' } },
      required: [],
    },
  },
  {
    name: 'get_open_orders',
    description: 'Get list of open orders',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_closed_orders',
    description: 'Get list of closed orders',
    inputSchema: {
      type: 'object',
      properties: {
        start: { type: 'number', description: 'Starting unix timestamp' },
        end: { type: 'number', description: 'Ending unix timestamp' },
      },
      required: [],
    },
  },
  {
    name: 'get_trades_history',
    description: 'Get trade history',
    inputSchema: {
      type: 'object',
      properties: {
        start: { type: 'number', description: 'Starting unix timestamp' },
        end: { type: 'number', description: 'Ending unix timestamp' },
      },
      required: [],
    },
  },
  {
    name: 'get_ledgers',
    description: 'Get ledger entries (deposits, withdrawals, trades, fees)',
    inputSchema: {
      type: 'object',
      properties: {
        asset: { type: 'string', description: 'Filter by asset' },
        type: { type: 'string', description: 'Filter by type: deposit, withdrawal, trade, margin, transfer' },
      },
      required: [],
    },
  },
  {
    name: 'get_ticker',
    description: 'Get ticker information for a trading pair (public, no auth)',
    inputSchema: {
      type: 'object',
      properties: { pair: { type: 'string', description: 'Trading pair (e.g., XBTUSD, ETHUSD)' } },
      required: ['pair'],
    },
  },
];

export class KrakenMCPServer implements MCPServerInstance {
  name = 'kraken';
  version = '1.0.0';
  description = 'Kraken - Access Kraken exchange for balances, orders, trades, and ledger history.';
  tools: MCPTool[] = [];
  private apiKey?: string;
  private apiSecret?: string;

  setTokens(tokens: { token1?: string; token2?: string }): void {
    this.apiKey = tokens.token1;
    this.apiSecret = tokens.token2;
    console.log('[kraken] API credentials configured');
  }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((t) => this.convertTool(t));
    console.log(`[kraken] Initialized with ${this.tools.length} tools`);
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

  private getSignature(path: string, nonce: number, postData: string): string {
    if (!this.apiSecret) throw new Error('API secret not configured');
    const message = nonce + postData;
    const hash = crypto.createHash('sha256').update(message).digest();
    const hmac = crypto.createHmac('sha512', Buffer.from(this.apiSecret, 'base64'));
    hmac.update(path);
    hmac.update(hash);
    return hmac.digest('base64');
  }

  private async publicRequest(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    const url = new URL(`${BASE_URL}/0/public/${endpoint}`);
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) url.searchParams.append(k, String(v)); });
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Kraken API error ${res.status}`);
    const data = await res.json();
    if (data.error && data.error.length > 0) throw new Error(`Kraken API error: ${data.error.join(', ')}`);
    return data.result;
  }

  private async privateRequest(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('Kraken API credentials not configured. Add API key and secret in Capabilities settings.');
    }
    const path = `/0/private/${endpoint}`;
    const nonce = Date.now() * 1000;
    const postData = new URLSearchParams({ nonce: String(nonce), ...params }).toString();
    const signature = this.getSignature(path, nonce, postData);
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'API-Key': this.apiKey, 'API-Sign': signature, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: postData,
    });
    if (!res.ok) throw new Error(`Kraken API error ${res.status}`);
    const data = await res.json();
    if (data.error && data.error.length > 0) throw new Error(`Kraken API error: ${data.error.join(', ')}`);
    return data.result;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    try {
      switch (name) {
        case 'get_account_balance': {
          const data = await this.privateRequest('Balance');
          const balances = Object.entries(data).filter(([_, v]) => parseFloat(v as string) > 0).map(([asset, value]) => ({ asset, balance: parseFloat(value as string) }));
          return { success: true, data: { balances, count: balances.length, timestamp: new Date().toISOString() } };
        }
        case 'get_trade_balance': {
          const asset = (args.asset as string) || 'ZUSD';
          const data = await this.privateRequest('TradeBalance', { asset });
          return { success: true, data: { equity: parseFloat(data.eb || '0'), tradeBalance: parseFloat(data.tb || '0'), marginUsed: parseFloat(data.m || '0'), freeMargin: parseFloat(data.mf || '0'), baseAsset: asset } };
        }
        case 'get_open_orders': {
          const data = await this.privateRequest('OpenOrders');
          const orders = Object.entries(data.open || {}).map(([id, order]: [string, any]) => ({
            orderId: id, status: order.status, pair: order.descr?.pair, type: order.descr?.type, price: order.descr?.price, volume: parseFloat(order.vol), volumeExecuted: parseFloat(order.vol_exec),
          }));
          return { success: true, data: { orders, count: orders.length } };
        }
        case 'get_closed_orders': {
          const params: Record<string, any> = {};
          if (args.start) params.start = args.start;
          if (args.end) params.end = args.end;
          const data = await this.privateRequest('ClosedOrders', params);
          const orders = Object.entries(data.closed || {}).map(([id, order]: [string, any]) => ({
            orderId: id, status: order.status, pair: order.descr?.pair, type: order.descr?.type, price: order.descr?.price, volume: parseFloat(order.vol), cost: parseFloat(order.cost), fee: parseFloat(order.fee),
          }));
          return { success: true, data: { orders, count: data.count || orders.length } };
        }
        case 'get_trades_history': {
          const params: Record<string, any> = {};
          if (args.start) params.start = args.start;
          if (args.end) params.end = args.end;
          const data = await this.privateRequest('TradesHistory', params);
          const trades = Object.entries(data.trades || {}).map(([id, trade]: [string, any]) => ({
            tradeId: id, pair: trade.pair, time: new Date(trade.time * 1000).toISOString(), type: trade.type, price: parseFloat(trade.price), cost: parseFloat(trade.cost), fee: parseFloat(trade.fee), volume: parseFloat(trade.vol),
          }));
          return { success: true, data: { trades, count: data.count || trades.length } };
        }
        case 'get_ledgers': {
          const params: Record<string, any> = {};
          if (args.asset) params.asset = args.asset;
          if (args.type) params.type = args.type;
          const data = await this.privateRequest('Ledgers', params);
          const ledgers = Object.entries(data.ledger || {}).map(([id, entry]: [string, any]) => ({
            ledgerId: id, time: new Date(entry.time * 1000).toISOString(), type: entry.type, asset: entry.asset, amount: parseFloat(entry.amount), fee: parseFloat(entry.fee), balance: parseFloat(entry.balance),
          }));
          return { success: true, data: { ledgers, count: data.count || ledgers.length } };
        }
        case 'get_ticker': {
          const pair = (args.pair as string).toUpperCase();
          const data = await this.publicRequest('Ticker', { pair });
          const tickerData = Object.values(data)[0] as any;
          return { success: true, data: { pair, ask: parseFloat(tickerData.a[0]), bid: parseFloat(tickerData.b[0]), last: parseFloat(tickerData.c[0]), volume24h: parseFloat(tickerData.v[1]), low24h: parseFloat(tickerData.l[1]), high24h: parseFloat(tickerData.h[1]) } };
        }
        default: return { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
  }
}

export const krakenServer = new KrakenMCPServer();
