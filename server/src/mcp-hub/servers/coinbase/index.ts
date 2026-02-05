/**
 * Coinbase MCP Server - JWT Authentication
 */

import crypto from 'crypto';
import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';

const BASE_URL = 'https://api.coinbase.com';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, any>; required: string[] };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'list_accounts',
    description: 'List all accounts/wallets in the Coinbase portfolio',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Number of accounts to return (default: 25)' } },
      required: [],
    },
  },
  {
    name: 'get_account',
    description: 'Get details of a specific account by ID',
    inputSchema: {
      type: 'object',
      properties: { accountId: { type: 'string', description: 'The account UUID' } },
      required: ['accountId'],
    },
  },
  {
    name: 'get_transactions',
    description: 'Get transactions for an account',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'The account UUID' },
        limit: { type: 'number', description: 'Number of transactions to return' },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'get_deposits',
    description: 'Get deposit history for an account',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'The account UUID' },
        limit: { type: 'number', description: 'Number of deposits to return' },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'get_withdrawals',
    description: 'Get withdrawal history for an account',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'The account UUID' },
        limit: { type: 'number', description: 'Number of withdrawals to return' },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'get_spot_price',
    description: 'Get the spot price for a currency pair (public, no auth)',
    inputSchema: {
      type: 'object',
      properties: {
        currencyPair: { type: 'string', description: 'Currency pair (e.g., BTC-USD, ETH-USD)' },
        date: { type: 'string', description: 'Historical date (YYYY-MM-DD). Omit for current price.' },
      },
      required: ['currencyPair'],
    },
  },
  {
    name: 'get_exchange_rates',
    description: 'Get exchange rates for a base currency (public)',
    inputSchema: {
      type: 'object',
      properties: { currency: { type: 'string', description: 'Base currency (e.g., USD, BTC)' } },
      required: [],
    },
  },
];

export class CoinbaseMCPServer implements MCPServerInstance {
  name = 'coinbase';
  version = '1.0.0';
  description = 'Coinbase - Access Coinbase accounts, transactions, deposits, and withdrawals.';
  tools: MCPTool[] = [];
  private apiKeyName?: string;
  private privateKey?: string;

  setTokens(tokens: { token1?: string; token2?: string }): void {
    this.apiKeyName = tokens.token1;
    this.privateKey = tokens.token2;
    console.log('[coinbase] API credentials configured');
  }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((t) => this.convertTool(t));
    console.log(`[coinbase] Initialized with ${this.tools.length} tools`);
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

  private generateJWT(requestMethod: string, requestPath: string): string {
    if (!this.apiKeyName || !this.privateKey) throw new Error('Coinbase API credentials not configured');
    const header = { alg: 'ES256', typ: 'JWT', kid: this.apiKeyName, nonce: crypto.randomBytes(16).toString('hex') };
    const payload = { iss: 'coinbase-cloud', nbf: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 120, sub: this.apiKeyName, uri: `${requestMethod} ${requestPath}` };
    const encodeBase64Url = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const headerEncoded = encodeBase64Url(header);
    const payloadEncoded = encodeBase64Url(payload);
    const message = `${headerEncoded}.${payloadEncoded}`;
    const sign = crypto.createSign('SHA256');
    sign.update(message);
    const signature = sign.sign(this.privateKey, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${message}.${signature}`;
  }

  private async publicRequest(endpoint: string): Promise<any> {
    const res = await fetch(`${BASE_URL}${endpoint}`);
    if (!res.ok) throw new Error(`Coinbase API error ${res.status}`);
    return res.json();
  }

  private async privateRequest(method: string, endpoint: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.apiKeyName || !this.privateKey) {
      throw new Error('Coinbase API credentials not configured. Add API key name and private key in Capabilities settings.');
    }
    const url = new URL(`${BASE_URL}${endpoint}`);
    if (method === 'GET') Object.entries(params).forEach(([k, v]) => { if (v !== undefined) url.searchParams.append(k, String(v)); });
    const jwt = this.generateJWT(method, url.pathname);
    const res = await fetch(url.toString(), { method, headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' }, ...(method !== 'GET' && { body: JSON.stringify(params) }) });
    if (!res.ok) throw new Error(`Coinbase API error ${res.status}`);
    return res.json();
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    try {
      switch (name) {
        case 'list_accounts': {
          const limit = Number(args.limit) || 25;
          const data = await this.privateRequest('GET', '/v2/accounts', { limit });
          const accounts = (data.data || []).map((acc: any) => ({
            id: acc.id, name: acc.name, type: acc.type, currency: acc.currency?.code,
            balance: { amount: parseFloat(acc.balance?.amount || '0'), currency: acc.balance?.currency },
            nativeBalance: { amount: parseFloat(acc.native_balance?.amount || '0'), currency: acc.native_balance?.currency },
          }));
          return { success: true, data: { accounts, count: accounts.length } };
        }
        case 'get_account': {
          const accountId = args.accountId as string;
          const data = await this.privateRequest('GET', `/v2/accounts/${accountId}`);
          const acc = data.data;
          return { success: true, data: { id: acc.id, name: acc.name, type: acc.type, currency: acc.currency, balance: { amount: parseFloat(acc.balance?.amount || '0'), currency: acc.balance?.currency } } };
        }
        case 'get_transactions': {
          const accountId = args.accountId as string;
          const limit = Number(args.limit) || 25;
          const data = await this.privateRequest('GET', `/v2/accounts/${accountId}/transactions`, { limit });
          const transactions = (data.data || []).map((tx: any) => ({
            id: tx.id, type: tx.type, status: tx.status,
            amount: { amount: parseFloat(tx.amount?.amount || '0'), currency: tx.amount?.currency },
            description: tx.description, createdAt: tx.created_at,
          }));
          return { success: true, data: { accountId, transactions, count: transactions.length } };
        }
        case 'get_deposits': {
          const accountId = args.accountId as string;
          const limit = Number(args.limit) || 25;
          const data = await this.privateRequest('GET', `/v2/accounts/${accountId}/deposits`, { limit });
          const deposits = (data.data || []).map((d: any) => ({
            id: d.id, status: d.status, amount: { amount: parseFloat(d.amount?.amount || '0'), currency: d.amount?.currency }, createdAt: d.created_at,
          }));
          return { success: true, data: { accountId, deposits, count: deposits.length } };
        }
        case 'get_withdrawals': {
          const accountId = args.accountId as string;
          const limit = Number(args.limit) || 25;
          const data = await this.privateRequest('GET', `/v2/accounts/${accountId}/withdrawals`, { limit });
          const withdrawals = (data.data || []).map((w: any) => ({
            id: w.id, status: w.status, amount: { amount: parseFloat(w.amount?.amount || '0'), currency: w.amount?.currency }, createdAt: w.created_at,
          }));
          return { success: true, data: { accountId, withdrawals, count: withdrawals.length } };
        }
        case 'get_spot_price': {
          const currencyPair = (args.currencyPair as string).toUpperCase();
          const date = args.date as string | undefined;
          const endpoint = date ? `/v2/prices/${currencyPair}/spot?date=${date}` : `/v2/prices/${currencyPair}/spot`;
          const data = await this.publicRequest(endpoint);
          return { success: true, data: { currencyPair, price: parseFloat(data.data?.amount || '0'), currency: data.data?.currency } };
        }
        case 'get_exchange_rates': {
          const currency = (args.currency as string) || 'USD';
          const data = await this.publicRequest(`/v2/exchange-rates?currency=${currency}`);
          const rates = Object.entries(data.data?.rates || {}).slice(0, 20).map(([curr, rate]) => ({ currency: curr, rate: parseFloat(rate as string) }));
          return { success: true, data: { baseCurrency: data.data?.currency, rates, totalCurrencies: Object.keys(data.data?.rates || {}).length } };
        }
        default: return { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
  }
}

export const coinbaseServer = new CoinbaseMCPServer();
