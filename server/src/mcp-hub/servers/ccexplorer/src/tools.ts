import { z } from 'zod';
import { CCExplorerClient } from './api-client.js';

/**
 * CC Explorer Pro MCP Tool Definitions (Bundled for Agent-in-a-Box)
 * 
 * SLIM descriptions for LLM token efficiency
 */

export const tools = [
  {
    name: 'consensus_get',
    description: 'Get consensus block',
    inputSchema: z.object({}),
    handler: async (client: CCExplorerClient) => client.getConsensus(),
  },
  {
    name: 'contract_get',
    description: 'Get contract by ID',
    inputSchema: z.object({ id: z.string().describe('id') }),
    handler: async (client: CCExplorerClient, args: { id: string }) => client.getContract(args.id),
  },
  {
    name: 'contract_updates_list',
    description: 'List contract updates',
    inputSchema: z.object({
      id: z.string().describe('id'),
      limit: z.number().optional().describe('limit'),
      offset: z.number().optional().describe('offset'),
    }),
    handler: async (client: CCExplorerClient, args: { id: string; limit?: number; offset?: number }) =>
      client.getContractUpdates(args.id, args.limit, args.offset),
  },
  {
    name: 'party_updates_list',
    description: 'List party updates',
    inputSchema: z.object({
      id: z.string().describe('id'),
      limit: z.number().optional().describe('limit'),
      offset: z.number().optional().describe('offset'),
    }),
    handler: async (client: CCExplorerClient, args: { id: string; limit?: number; offset?: number }) =>
      client.getPartyUpdates(args.id, args.limit, args.offset),
  },
  {
    name: 'update_get',
    description: 'Get update by ID',
    inputSchema: z.object({ update_id: z.string().describe('id') }),
    handler: async (client: CCExplorerClient, args: { update_id: string }) =>
      client.getUpdateDetail(args.update_id),
  },
  {
    name: 'updates_list',
    description: 'List updates',
    inputSchema: z.object({
      limit: z.number().optional().describe('limit'),
      offset: z.number().optional().describe('offset'),
    }),
    handler: async (client: CCExplorerClient, args: { limit?: number; offset?: number }) =>
      client.getUpdates(args.limit, args.offset),
  },
  {
    name: 'round_current',
    description: 'Get current round',
    inputSchema: z.object({}),
    handler: async (client: CCExplorerClient) => client.getCurrentRound(),
  },
  {
    name: 'governance_get',
    description: 'Get governance by CID',
    inputSchema: z.object({ trackingCid: z.string().describe('cid') }),
    handler: async (client: CCExplorerClient, args: { trackingCid: string }) =>
      client.getGovernanceDetail(args.trackingCid),
  },
  {
    name: 'governance_list',
    description: 'List governance votes',
    inputSchema: z.object({}),
    handler: async (client: CCExplorerClient) => client.getGovernance(),
  },
  {
    name: 'overview_get',
    description: 'Get network overview',
    inputSchema: z.object({}),
    handler: async (client: CCExplorerClient) => client.getOverview(),
  },
  {
    name: 'party_get',
    description: 'Get party by ID',
    inputSchema: z.object({ id: z.string().describe('id') }),
    handler: async (client: CCExplorerClient, args: { id: string }) => client.getPartyDetail(args.id),
  },
  {
    name: 'search',
    description: 'Search network',
    inputSchema: z.object({ query: z.string().describe('query') }),
    handler: async (client: CCExplorerClient, args: { query: string }) => client.search(args.query),
  },
  {
    name: 'super_validators_list',
    description: 'List super validators',
    inputSchema: z.object({}),
    handler: async (client: CCExplorerClient) => client.getSuperValidators(),
  },
  {
    name: 'validators_list',
    description: 'List validators',
    inputSchema: z.object({}),
    handler: async (client: CCExplorerClient) => client.getValidators(),
  },
];

