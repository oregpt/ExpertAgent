/**
 * Plaid MCP Server - Financial data aggregation
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';

const BASE_URL = 'https://production.plaid.com'; // or sandbox.plaid.com for testing

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, any>; required: string[] };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'get_accounts',
    description: 'Get all linked bank accounts',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_balances',
    description: 'Get current balances for all linked accounts',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_transactions',
    description: 'Get transactions for linked accounts',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        count: { type: 'number', description: 'Number of transactions (default: 100)' },
      },
      required: ['startDate', 'endDate'],
    },
  },
  {
    name: 'get_identity',
    description: 'Get account holder identity information',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_auth',
    description: 'Get account and routing numbers for ACH transfers',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

export class PlaidMCPServer implements MCPServerInstance {
  name = 'plaid';
  version = '1.0.0';
  description = 'Plaid - Access bank accounts, balances, transactions, and identity data.';
  tools: MCPTool[] = [];
  private clientId?: string;
  private secret?: string;
  private accessToken?: string;

  setTokens(tokens: { token1?: string; token2?: string; token3?: string }): void {
    this.clientId = tokens.token1;
    this.secret = tokens.token2;
    this.accessToken = tokens.token3;
    console.log('[plaid] API credentials configured');
  }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((t) => this.convertTool(t));
    console.log(`[plaid] Initialized with ${this.tools.length} tools`);
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

  private async request(endpoint: string, body: Record<string, any> = {}): Promise<any> {
    if (!this.clientId || !this.secret || !this.accessToken) {
      throw new Error('Plaid not configured. Add client_id, secret, and access_token in Capabilities settings.');
    }
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: this.clientId, secret: this.secret, access_token: this.accessToken, ...body }),
    });
    if (!res.ok) throw new Error(`Plaid API error ${res.status}`);
    return res.json();
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    try {
      switch (name) {
        case 'get_accounts': {
          const data = await this.request('/accounts/get');
          return { success: true, data: { accounts: data.accounts?.map((a: any) => ({ id: a.account_id, name: a.name, type: a.type, subtype: a.subtype, mask: a.mask })), item: data.item } };
        }
        case 'get_balances': {
          const data = await this.request('/accounts/balance/get');
          return { success: true, data: { accounts: data.accounts?.map((a: any) => ({ id: a.account_id, name: a.name, type: a.type, balances: { available: a.balances?.available, current: a.balances?.current, limit: a.balances?.limit, currency: a.balances?.iso_currency_code } })) } };
        }
        case 'get_transactions': {
          const startDate = args.startDate as string;
          const endDate = args.endDate as string;
          const count = Number(args.count) || 100;
          const data = await this.request('/transactions/get', { start_date: startDate, end_date: endDate, options: { count } });
          return { success: true, data: { transactions: data.transactions?.map((t: any) => ({ id: t.transaction_id, accountId: t.account_id, amount: t.amount, date: t.date, name: t.name, category: t.category, merchantName: t.merchant_name })), totalTransactions: data.total_transactions } };
        }
        case 'get_identity': {
          const data = await this.request('/identity/get');
          return { success: true, data: { accounts: data.accounts?.map((a: any) => ({ id: a.account_id, owners: a.owners?.map((o: any) => ({ names: o.names, emails: o.emails, phones: o.phone_numbers, addresses: o.addresses })) })) } };
        }
        case 'get_auth': {
          const data = await this.request('/auth/get');
          return { success: true, data: { accounts: data.accounts?.map((a: any) => ({ id: a.account_id, name: a.name, type: a.type })), numbers: data.numbers } };
        }
        default: return { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
  }
}

export const plaidServer = new PlaidMCPServer();
