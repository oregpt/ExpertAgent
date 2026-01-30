import { z } from 'zod';
import { LighthouseClient } from './api-client';

/**
 * Lighthouse Explorer MCP Tool Definitions (CantonLoop)
 * 
 * SLIM descriptions for LLM token efficiency
 */

export const tools = [
  // CNS (Canton Name Service)
  {
    name: 'cns_list',
    description: 'List CNS records',
    inputSchema: z.object({
      limit: z.number().optional().describe('limit'),
      cursor: z.string().optional().describe('cursor'),
      direction: z.string().optional().describe('direction'),
    }),
    handler: async (client: LighthouseClient, args: { limit?: number; cursor?: string; direction?: string }) =>
      client.listCns(args.limit, args.cursor, args.direction),
  },
  {
    name: 'cns_get',
    description: 'Get CNS by domain',
    inputSchema: z.object({ domainName: z.string().describe('domain') }),
    handler: async (client: LighthouseClient, args: { domainName: string }) =>
      client.getCns(args.domainName),
  },

  // Contracts
  {
    name: 'contracts_list',
    description: 'List contracts',
    inputSchema: z.object({
      limit: z.number().optional().describe('limit'),
      cursor: z.number().optional().describe('cursor'),
      direction: z.string().optional().describe('direction'),
    }),
    handler: async (client: LighthouseClient, args: { limit?: number; cursor?: number; direction?: string }) =>
      client.listContracts(args.limit, args.cursor, args.direction),
  },
  {
    name: 'contract_get',
    description: 'Get contract by ID',
    inputSchema: z.object({ id: z.string().describe('id') }),
    handler: async (client: LighthouseClient, args: { id: string }) =>
      client.getContract(args.id),
  },

  // Featured Apps
  {
    name: 'featured_apps_get',
    description: 'Get featured apps',
    inputSchema: z.object({}),
    handler: async (client: LighthouseClient) => client.getFeaturedApps(),
  },

  // Governance
  {
    name: 'governance_list',
    description: 'List governance votes',
    inputSchema: z.object({}),
    handler: async (client: LighthouseClient) => client.listGovernance(),
  },
  {
    name: 'governance_stats',
    description: 'Get governance stats',
    inputSchema: z.object({}),
    handler: async (client: LighthouseClient) => client.getGovernanceStats(),
  },
  {
    name: 'governance_get',
    description: 'Get governance vote',
    inputSchema: z.object({ id: z.string().describe('id') }),
    handler: async (client: LighthouseClient, args: { id: string }) =>
      client.getGovernance(args.id),
  },

  // Me
  {
    name: 'me_get',
    description: 'Get URL info',
    inputSchema: z.object({}),
    handler: async (client: LighthouseClient) => client.getMe(),
  },

  // Party
  {
    name: 'party_balance',
    description: 'Get party balance',
    inputSchema: z.object({ id: z.string().describe('id') }),
    handler: async (client: LighthouseClient, args: { id: string }) =>
      client.getPartyBalance(args.id),
  },
  {
    name: 'party_burns',
    description: 'List party burns',
    inputSchema: z.object({
      id: z.string().describe('id'),
      limit: z.number().optional().describe('limit'),
      cursor_id: z.number().optional().describe('cursor'),
      direction: z.string().optional().describe('direction'),
    }),
    handler: async (client: LighthouseClient, args: { id: string; limit?: number; cursor_id?: number; direction?: string }) =>
      client.getPartyBurns(args.id, args.limit, args.cursor_id, args.direction),
  },
  {
    name: 'party_pnl',
    description: 'Get party PnL',
    inputSchema: z.object({
      id: z.string().describe('id'),
      limit: z.number().optional().describe('limit'),
      cursor_round: z.number().optional().describe('cursor'),
      direction: z.string().optional().describe('direction'),
    }),
    handler: async (client: LighthouseClient, args: { id: string; limit?: number; cursor_round?: number; direction?: string }) =>
      client.getPartyPnl(args.id, args.limit, args.cursor_round, args.direction),
  },
  {
    name: 'party_rewards',
    description: 'List party rewards',
    inputSchema: z.object({
      id: z.string().describe('id'),
      limit: z.number().optional().describe('limit'),
      cursor_id: z.number().optional().describe('cursor'),
      direction: z.string().optional().describe('direction'),
    }),
    handler: async (client: LighthouseClient, args: { id: string; limit?: number; cursor_id?: number; direction?: string }) =>
      client.getPartyRewards(args.id, args.limit, args.cursor_id, args.direction),
  },
  {
    name: 'party_burn_stats',
    description: 'Get party burn stats',
    inputSchema: z.object({
      id: z.string().describe('id'),
      start_time: z.string().optional().describe('start'),
      end_time: z.string().optional().describe('end'),
    }),
    handler: async (client: LighthouseClient, args: { id: string; start_time?: string; end_time?: string }) =>
      client.getPartyBurnStats(args.id, args.start_time, args.end_time),
  },
  {
    name: 'party_reward_stats',
    description: 'Get party reward stats',
    inputSchema: z.object({
      id: z.string().describe('id'),
      start_time: z.string().optional().describe('start'),
      end_time: z.string().optional().describe('end'),
    }),
    handler: async (client: LighthouseClient, args: { id: string; start_time?: string; end_time?: string }) =>
      client.getPartyRewardStats(args.id, args.start_time, args.end_time),
  },
  {
    name: 'party_transfers',
    description: 'List party transfers',
    inputSchema: z.object({
      id: z.string().describe('id'),
      limit: z.number().optional().describe('limit'),
      cursor: z.number().optional().describe('cursor'),
      direction: z.string().optional().describe('direction'),
    }),
    handler: async (client: LighthouseClient, args: { id: string; limit?: number; cursor?: number; direction?: string }) =>
      client.getPartyTransfers(args.id, undefined, undefined, undefined, undefined, args.limit, args.cursor, args.direction),
  },
  {
    name: 'party_transactions',
    description: 'List party transactions',
    inputSchema: z.object({
      id: z.string().describe('id'),
      limit: z.number().optional().describe('limit'),
      cursor: z.number().optional().describe('cursor'),
      direction: z.string().optional().describe('direction'),
    }),
    handler: async (client: LighthouseClient, args: { id: string; limit?: number; cursor?: number; direction?: string }) =>
      client.getPartyTransactions(args.id, args.limit, args.cursor, args.direction),
  },

  // Preapprovals
  {
    name: 'preapprovals_list',
    description: 'List preapprovals',
    inputSchema: z.object({
      limit: z.number().optional().describe('limit'),
      cursor: z.number().optional().describe('cursor'),
      address: z.string().optional().describe('address'),
      direction: z.string().optional().describe('direction'),
    }),
    handler: async (client: LighthouseClient, args: { limit?: number; cursor?: number; address?: string; direction?: string }) =>
      client.listPreapprovals(args.limit, args.cursor, args.address, args.direction),
  },

  // Prices
  {
    name: 'price_get',
    description: 'Get CC price',
    inputSchema: z.object({}),
    handler: async (client: LighthouseClient) => client.getPrice(),
  },
  {
    name: 'price_history',
    description: 'Get 24h price history',
    inputSchema: z.object({
      instrument: z.string().optional().describe('instrument'),
      tz: z.string().optional().describe('timezone'),
    }),
    handler: async (client: LighthouseClient, args: { instrument?: string; tz?: string }) =>
      client.getPriceRange(args.instrument, args.tz),
  },

  // Rounds
  {
    name: 'rounds_list',
    description: 'List rounds',
    inputSchema: z.object({
      before: z.number().optional().describe('before'),
      limit: z.number().optional().describe('limit'),
    }),
    handler: async (client: LighthouseClient, args: { before?: number; limit?: number }) =>
      client.listRounds(args.before, args.limit),
  },
  {
    name: 'round_get',
    description: 'Get round by number',
    inputSchema: z.object({ number: z.number().describe('number') }),
    handler: async (client: LighthouseClient, args: { number: number }) =>
      client.getRound(args.number),
  },

  // Search
  {
    name: 'search',
    description: 'Search network',
    inputSchema: z.object({ q: z.string().describe('query') }),
    handler: async (client: LighthouseClient, args: { q: string }) =>
      client.search(args.q),
  },

  // Stats
  {
    name: 'stats_get',
    description: 'Get chain stats',
    inputSchema: z.object({}),
    handler: async (client: LighthouseClient) => client.getStats(),
  },
  {
    name: 'stats_rounds_latest',
    description: 'Get latest rounds',
    inputSchema: z.object({}),
    handler: async (client: LighthouseClient) => client.getLatestRounds(),
  },

  // Super Validators
  {
    name: 'super_validators_list',
    description: 'List super validators',
    inputSchema: z.object({}),
    handler: async (client: LighthouseClient) => client.listSuperValidators(),
  },

  // Transactions
  {
    name: 'transactions_list',
    description: 'List transactions',
    inputSchema: z.object({
      limit: z.number().optional().describe('limit'),
      cursor: z.string().optional().describe('cursor'),
      direction: z.string().optional().describe('direction'),
    }),
    handler: async (client: LighthouseClient, args: { limit?: number; cursor?: string; direction?: string }) =>
      client.listTransactions(args.limit, args.cursor, args.direction),
  },
  {
    name: 'transaction_get',
    description: 'Get transaction',
    inputSchema: z.object({ updateId: z.string().describe('updateId') }),
    handler: async (client: LighthouseClient, args: { updateId: string }) =>
      client.getTransaction(args.updateId),
  },

  // Transfers
  {
    name: 'transfers_list',
    description: 'List transfers',
    inputSchema: z.object({
      limit: z.number().optional().describe('limit'),
      cursor: z.number().optional().describe('cursor'),
      direction: z.string().optional().describe('direction'),
    }),
    handler: async (client: LighthouseClient, args: { limit?: number; cursor?: number; direction?: string }) =>
      client.listTransfers(undefined, undefined, args.limit, args.cursor, args.direction),
  },
  {
    name: 'transfer_get',
    description: 'Get transfer',
    inputSchema: z.object({ id: z.string().describe('id') }),
    handler: async (client: LighthouseClient, args: { id: string }) =>
      client.getTransfer(args.id),
  },

  // Validators
  {
    name: 'validators_list',
    description: 'List validators',
    inputSchema: z.object({}),
    handler: async (client: LighthouseClient) => client.listValidators(),
  },
  {
    name: 'validator_get',
    description: 'Get validator',
    inputSchema: z.object({ id: z.string().describe('id') }),
    handler: async (client: LighthouseClient, args: { id: string }) =>
      client.getValidator(args.id),
  },
];
