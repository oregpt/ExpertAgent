/**
 * Wallet Balance MCP Server
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';

const BASE_URL = 'https://wallet-balance-service-794628893589.us-central1.run.app';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, any>; required: string[] };
}

const SUPPORTED_CHAINS: Record<string, { name: string; symbol: string }> = {
  ethereum: { name: 'Ethereum', symbol: 'ETH' },
  polygon: { name: 'Polygon', symbol: 'MATIC' },
  arbitrum: { name: 'Arbitrum One', symbol: 'ETH' },
  optimism: { name: 'Optimism', symbol: 'ETH' },
  base: { name: 'Base', symbol: 'ETH' },
  avalanche: { name: 'Avalanche C-Chain', symbol: 'AVAX' },
  bsc: { name: 'BNB Smart Chain', symbol: 'BNB' },
  solana: { name: 'Solana', symbol: 'SOL' },
  bitcoin: { name: 'Bitcoin', symbol: 'BTC' },
};

const TOOLS: ToolDefinition[] = [
  {
    name: 'get_balance',
    description: 'Get the balance of a wallet address on a specific blockchain',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Wallet address to check' },
        chain: { type: 'string', description: 'Blockchain network (ethereum, polygon, arbitrum, base, solana, bitcoin, etc.)' },
        includeTokens: { type: 'boolean', description: 'Include ERC-20 token balances' },
      },
      required: ['address', 'chain'],
    },
  },
  {
    name: 'get_multiple_balances',
    description: 'Get balances for multiple addresses or chains at once',
    inputSchema: {
      type: 'object',
      properties: {
        addresses: { type: 'array', description: 'Array of wallet addresses' },
        chains: { type: 'array', description: 'Array of blockchain networks to check' },
      },
      required: ['addresses'],
    },
  },
  {
    name: 'list_supported_chains',
    description: 'List all supported blockchain networks',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'validate_address',
    description: 'Validate if an address is valid for a specific blockchain',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Address to validate' },
        chain: { type: 'string', description: 'Blockchain network' },
      },
      required: ['address', 'chain'],
    },
  },
];

export class WalletBalanceMCPServer implements MCPServerInstance {
  name = 'wallet-balance';
  version = '1.0.0';
  description = 'Wallet Balance Service - Get wallet balances across 30+ blockchain networks.';
  tools: MCPTool[] = [];
  private apiKey?: string;

  setApiKey(key: string): void { this.apiKey = key; }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((t) => this.convertTool(t));
    console.log(`[wallet-balance] Initialized with ${this.tools.length} tools`);
  }

  async shutdown(): Promise<void> {}
  async listTools(): Promise<MCPTool[]> { return this.tools; }

  private convertTool(tool: ToolDefinition): MCPTool {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, prop] of Object.entries(tool.inputSchema.properties || {})) {
      let field: z.ZodTypeAny = prop.type === 'number' ? z.number() : prop.type === 'boolean' ? z.boolean() : prop.type === 'array' ? z.array(z.string()) : z.string();
      if (!tool.inputSchema.required?.includes(key)) field = field.optional();
      shape[key] = field;
    }
    return { name: tool.name, description: tool.description, inputSchema: z.object(shape) };
  }

  private async request(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) url.searchParams.append(k, String(v)); });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) throw new Error(`Wallet Balance API error ${res.status}`);
    return res.json();
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    try {
      switch (name) {
        case 'get_balance': {
          const address = args.address as string;
          const chain = (args.chain as string).toLowerCase();
          const data = await this.request('/balance', { address, chain, includeTokens: args.includeTokens !== false });
          return { success: true, data: { address, chain, chainInfo: SUPPORTED_CHAINS[chain], nativeBalance: data.nativeBalance, tokens: data.tokens || [], totalValueUSD: data.totalValueUSD } };
        }
        case 'get_multiple_balances': {
          const addresses = args.addresses as string[];
          const chains = (args.chains as string[]) || ['ethereum'];
          const results = await Promise.all(
            addresses.flatMap((address) => chains.map(async (chain) => {
              try {
                const data = await this.request('/balance', { address, chain: chain.toLowerCase() });
                return { address, chain, nativeBalance: data.nativeBalance };
              } catch (err) { return { address, chain, error: String(err) }; }
            }))
          );
          return { success: true, data: { timestamp: new Date().toISOString(), results } };
        }
        case 'list_supported_chains': {
          return { success: true, data: { chains: Object.entries(SUPPORTED_CHAINS).map(([id, info]) => ({ id, ...info })), count: Object.keys(SUPPORTED_CHAINS).length } };
        }
        case 'validate_address': {
          const address = args.address as string;
          const chain = (args.chain as string).toLowerCase();
          let isValid = false;
          if (chain === 'solana') isValid = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
          else if (chain === 'bitcoin') isValid = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(address);
          else isValid = /^0x[a-fA-F0-9]{40}$/.test(address);
          return { success: true, data: { address, chain, isValid } };
        }
        default: return { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
  }
}

export const walletBalanceServer = new WalletBalanceMCPServer();
