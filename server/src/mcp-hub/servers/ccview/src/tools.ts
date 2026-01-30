/**
 * ccview.io MCP Tool Definitions
 * 
 * DESCRIPTION GUIDELINES (for LLM token efficiency):
 * - Tool `description`: max 80 chars (sent to LLM)
 * - Tool `documentation`: verbose details (for docs/UI only, NOT sent to LLM)
 * - Parameter `description`: max 20 chars (sent to LLM)
 * 
 * STATUS KEY:
 * - stable: Tested and working reliably
 * - experimental: Works but may need specific params
 * - deprecated: Returns 404, likely removed from API
 */

export type ToolStatus = 'stable' | 'experimental' | 'deprecated';

export interface ToolDefinition {
  name: string;
  description: string;  // SHORT - sent to LLM (max 80 chars)
  documentation?: string;  // VERBOSE - for docs/UI only, NOT sent to LLM
  status: ToolStatus;
  category: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;  // SHORT - max 20 chars
      enum?: string[];
    }>;
    required?: string[];
  };
  endpoint: string;
  version: 'v1' | 'v2' | 'v3';
}

export const TOOLS: ToolDefinition[] = [
  // ============================================
  // GOVERNANCE (6/6 stable)
  // ============================================
  {
    name: 'governance_list_active',
    description: 'List active governance proposals',
    status: 'stable',
    category: 'Governance',
    inputSchema: {
      type: 'object',
      properties: {
        offset: { type: 'number', description: 'offset' },
        limit: { type: 'number', description: 'limit' }
      }
    },
    endpoint: 'governances/active',
    version: 'v2'
  },
  {
    name: 'governance_list_completed',
    description: 'List completed governance proposals',
    status: 'stable',
    category: 'Governance',
    inputSchema: {
      type: 'object',
      properties: {
        offset: { type: 'number', description: 'offset' },
        limit: { type: 'number', description: 'limit' }
      }
    },
    endpoint: 'governances/completed',
    version: 'v2'
  },
  {
    name: 'governance_search',
    description: 'Search governance proposals',
    status: 'stable',
    category: 'Governance',
    inputSchema: {
      type: 'object',
      properties: {
        offset: { type: 'number', description: 'offset' },
        limit: { type: 'number', description: 'limit' },
        votes_filter_type: { type: 'string', description: 'filter' },
        search_arg: { type: 'string', description: 'query' }
      }
    },
    endpoint: 'governances',
    version: 'v2'
  },
  {
    name: 'governance_price_votes',
    description: 'Get price votes',
    status: 'stable',
    category: 'Governance',
    inputSchema: {
      type: 'object',
      properties: {
        offset: { type: 'number', description: 'offset' },
        limit: { type: 'number', description: 'limit' }
      }
    },
    endpoint: 'governances/price-votes',
    version: 'v2'
  },
  {
    name: 'governance_details',
    description: 'Get governance proposal details',
    status: 'stable',
    category: 'Governance',
    inputSchema: {
      type: 'object',
      properties: {
        tracking_cid: { type: 'string', description: 'The governance tracking CID' }
      },
      required: ['tracking_cid']
    },
    endpoint: 'governances/details/{tracking_cid}',
    version: 'v1'
  },
  {
    name: 'governance_statistics',
    description: 'Get governance stats',
    status: 'stable',
    category: 'Governance',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    endpoint: 'governances/statistics',
    version: 'v1'
  },

  // ============================================
  // ANS - Canton Name Service (4/5 stable)
  // ============================================
  {
    name: 'ans_check_availability',
    description: 'Check ANS availability',
    status: 'stable',
    category: 'ANS',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'name' }
      },
      required: ['name']
    },
    endpoint: 'ans/available/{name}',
    version: 'v1'
  },
  {
    name: 'ans_list_by_party',
    description: 'List ANS names owned by a party',
    status: 'stable',
    category: 'ANS',
    inputSchema: {
      type: 'object',
      properties: {
        party_id: { type: 'string', description: 'The party ID' }
      },
      required: ['party_id']
    },
    endpoint: 'ans/list/{party_id}',
    version: 'v1'
  },
  {
    name: 'ans_context_by_name',
    description: 'Get ANS context for a name',
    status: 'stable',
    category: 'ANS',
    inputSchema: {
      type: 'object',
      properties: {
        ans: { type: 'string', description: 'The ANS name' }
      },
      required: ['ans']
    },
    endpoint: 'ans/context/list-by-name/{ans}',
    version: 'v1'
  },
  {
    name: 'ans_context_by_party',
    description: 'Get ANS context for a party',
    status: 'stable',
    category: 'ANS',
    inputSchema: {
      type: 'object',
      properties: {
        party_id: { type: 'string', description: 'The party ID' }
      },
      required: ['party_id']
    },
    endpoint: 'ans/context/list-by-party/{party_id}',
    version: 'v1'
  },
  {
    name: 'ans_request_status',
    description: '[EXPERIMENTAL] Get ANS request status by reference',
    status: 'experimental',
    category: 'ANS',
    inputSchema: {
      type: 'object',
      properties: {
        reference: { type: 'string', description: 'The request reference' }
      },
      required: ['reference']
    },
    endpoint: 'ans/req-details/{reference}',
    version: 'v1'
  },

  // ============================================
  // SUPER VALIDATORS (3/4 stable)
  // ============================================
  {
    name: 'super_validators_escrow',
    description: 'List super validators in escrow',
    status: 'stable',
    category: 'Super Validators',
    inputSchema: {
      type: 'object',
      properties: {
        offset: { type: 'number', description: 'offset' },
        limit: { type: 'number', description: 'limit' }
      }
    },
    endpoint: 'super-validators/escrow',
    version: 'v2'
  },
  {
    name: 'super_validators_hosted',
    description: 'List hosted super validators',
    status: 'stable',
    category: 'Super Validators',
    inputSchema: {
      type: 'object',
      properties: {
        offset: { type: 'number', description: 'offset' },
        limit: { type: 'number', description: 'limit' }
      }
    },
    endpoint: 'super-validators/hosted',
    version: 'v2'
  },
  {
    name: 'super_validators_standalone',
    description: 'List standalone SVs',
    status: 'stable',
    category: 'Super Validators',
    inputSchema: {
      type: 'object',
      properties: {
        offset: { type: 'number', description: 'offset' },
        limit: { type: 'number', description: 'limit' }
      }
    },
    endpoint: 'super-validators/standalone',
    version: 'v2'
  },
  {
    name: 'super_validators_onboarded',
    description: '[EXPERIMENTAL] List onboarded validators',
    status: 'experimental',
    category: 'Super Validators',
    inputSchema: {
      type: 'object',
      properties: {
        offset: { type: 'number', description: 'offset' },
        limit: { type: 'number', description: 'limit' },
        sv_party_id: { type: 'string', description: 'Super validator party ID' }
      }
    },
    endpoint: 'super-validators/onboarded-validators',
    version: 'v2'
  },

  // ============================================
  // VALIDATORS (3/4 stable)
  // ============================================
  {
    name: 'validators_list',
    description: 'List all validators on the Canton Network',
    status: 'stable',
    category: 'Validators',
    inputSchema: {
      type: 'object',
      properties: {
        offset: { type: 'number', description: 'offset' },
        limit: { type: 'number', description: 'limit' },
        sort_field: { type: 'string', description: 'Field to sort by' },
        sort_order: { type: 'string', description: 'asc or desc' }
      }
    },
    endpoint: 'validators',
    version: 'v2'
  },
  {
    name: 'validator_details',
    description: 'Get validator details',
    status: 'stable',
    category: 'Validators',
    inputSchema: {
      type: 'object',
      properties: {
        validator_id: { type: 'string', description: 'The validator ID' }
      },
      required: ['validator_id']
    },
    endpoint: 'validators/{validator_id}',
    version: 'v1'
  },
  {
    name: 'validator_statistics',
    description: 'Get statistics for a validator',
    status: 'stable',
    category: 'Validators',
    inputSchema: {
      type: 'object',
      properties: {
        validator_id: { type: 'string', description: 'The validator ID' }
      },
      required: ['validator_id']
    },
    endpoint: 'validators/statistics',
    version: 'v1'
  },
  {
    name: 'validator_performance_ranged',
    description: '[EXPERIMENTAL] Get validator performance over a range',
    status: 'experimental',
    category: 'Validators',
    inputSchema: {
      type: 'object',
      properties: {
        validator_id: { type: 'string', description: 'The validator ID' },
        start: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        end: { type: 'string', description: 'End date (YYYY-MM-DD)' }
      },
      required: ['validator_id']
    },
    endpoint: 'validators/perfomance-ranged',
    version: 'v1'
  },

  // ============================================
  // PARTIES (2 stable, 8 experimental)
  // ============================================
  {
    name: 'party_details',
    description: 'Get details for a party (wallet/account)',
    status: 'stable',
    category: 'Parties',
    inputSchema: {
      type: 'object',
      properties: {
        party_id: { type: 'string', description: 'The party ID' }
      },
      required: ['party_id']
    },
    endpoint: 'parties/{party_id}',
    version: 'v1'
  },
  {
    name: 'party_counterparties',
    description: 'Get counterparties for a party',
    status: 'stable',
    category: 'Parties',
    inputSchema: {
      type: 'object',
      properties: {
        party_id: { type: 'string', description: 'The party ID' },
        limit: { type: 'number', description: 'limit' }
      },
      required: ['party_id']
    },
    endpoint: 'parties/counterparties',
    version: 'v1'
  },
  {
    name: 'party_balance_changes',
    description: '[EXPERIMENTAL] Get balance changes for a party',
    status: 'experimental',
    category: 'Parties',
    inputSchema: {
      type: 'object',
      properties: {
        party_id: { type: 'string', description: 'The party ID' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'limit' }
      },
      required: ['party_id']
    },
    endpoint: 'parties/balance-changes',
    version: 'v2'
  },
  {
    name: 'party_interactions',
    description: '[EXPERIMENTAL] Get interactions for a party',
    status: 'experimental',
    category: 'Parties',
    inputSchema: {
      type: 'object',
      properties: {
        party_id: { type: 'string', description: 'The party ID' },
        limit: { type: 'number', description: 'limit' }
      },
      required: ['party_id']
    },
    endpoint: 'parties/interactions',
    version: 'v1'
  },

  // ============================================
  // TOKEN TRANSFERS (3 stable, 9 experimental)
  // ============================================
  {
    name: 'token_transfers_list',
    description: 'List recent token transfers',
    status: 'stable',
    category: 'Token Transfers',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'limit' }
      }
    },
    endpoint: 'token-transfers',
    version: 'v2'
  },
  {
    name: 'token_transfer_details',
    description: 'Get details for a specific transfer by event ID',
    status: 'stable',
    category: 'Token Transfers',
    inputSchema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'The transfer event ID' }
      },
      required: ['event_id']
    },
    endpoint: 'token-transfers/{event_id}',
    version: 'v2'
  },
  {
    name: 'token_transfer_instructions',
    description: 'Get transfer instructions by event ID',
    status: 'stable',
    category: 'Token Transfers',
    inputSchema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'The transfer event ID' }
      },
      required: ['event_id']
    },
    endpoint: 'token-transfer-instructions/{event_id}',
    version: 'v1'
  },
  {
    name: 'token_transfers_by_party',
    description: '[EXPERIMENTAL] Get transfers for a party',
    status: 'experimental',
    category: 'Token Transfers',
    inputSchema: {
      type: 'object',
      properties: {
        party_id: { type: 'string', description: 'The party ID' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'limit' }
      },
      required: ['party_id']
    },
    endpoint: 'token-transfers/by-party',
    version: 'v2'
  },

  // ============================================
  // EXPLORE / STATS (5/5 stable)
  // ============================================
  {
    name: 'explore_stats',
    description: 'Get Canton Network explorer statistics',
    status: 'stable',
    category: 'Explore',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    endpoint: 'explore/stats',
    version: 'v2'
  },
  {
    name: 'explore_prices',
    description: 'Get current token prices',
    status: 'stable',
    category: 'Explore',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    endpoint: 'explore/prices',
    version: 'v2'
  },
  {
    name: 'explore_prices_proxy',
    description: 'Get token prices via proxy',
    status: 'stable',
    category: 'Explore',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    endpoint: 'explore/prices-proxy',
    version: 'v2'
  },
  {
    name: 'explore_supply_stats',
    description: 'Get supply statistics over a date range',
    status: 'stable',
    category: 'Explore',
    inputSchema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        end: { type: 'string', description: 'End date (YYYY-MM-DD)' }
      },
      required: ['start', 'end']
    },
    endpoint: 'explore/supply-stats',
    version: 'v1'
  },
  {
    name: 'explore_transfer_stat_per_day',
    description: 'Get daily transfer statistics',
    status: 'stable',
    category: 'Explore',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    endpoint: 'explore/transfer-stat-per-day',
    version: 'v1'
  },

  // ============================================
  // OFFERS (2/2 stable)
  // ============================================
  {
    name: 'offers_search',
    description: 'Search offers on the network',
    status: 'stable',
    category: 'Offers',
    inputSchema: {
      type: 'object',
      properties: {
        party_id: { type: 'string', description: 'Filter by party ID' },
        status: { type: 'string', description: 'Filter by status' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'limit' }
      }
    },
    endpoint: 'offers/search',
    version: 'v2'
  },
  {
    name: 'offers_stat',
    description: 'Get offer stats',
    status: 'stable',
    category: 'Offers',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    endpoint: 'offers/stat',
    version: 'v2'
  },

  // ============================================
  // FEATURED APPS (1/2 stable)
  // ============================================
  {
    name: 'featured_apps_list',
    description: 'List featured apps on Canton Network',
    status: 'stable',
    category: 'Featured Apps',
    inputSchema: {
      type: 'object',
      properties: {
        offset: { type: 'number', description: 'offset' },
        limit: { type: 'number', description: 'limit' }
      }
    },
    endpoint: 'featured-apps',
    version: 'v2'
  },
  {
    name: 'featured_apps_top5',
    description: '[EXPERIMENTAL] Get top 5 featured apps',
    status: 'experimental',
    category: 'Featured Apps',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    endpoint: 'featured-apps/top5',
    version: 'v2'
  },

  // ============================================
  // REWARDS LEADERBOARD (2 stable)
  // ============================================
  {
    name: 'rewards_leaderboard_top',
    description: 'Get top rewards leaderboard',
    status: 'stable',
    category: 'Rewards',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'limit' },
        leader_type: { type: 'string', description: 'Type of leader' }
      }
    },
    endpoint: 'rewards/leaderboard/top',
    version: 'v1'
  },
  {
    name: 'rewards_leaderboard_stat',
    description: 'Get rewards leaderboard statistics',
    status: 'stable',
    category: 'Rewards',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    endpoint: 'rewards/leaderboard/stat',
    version: 'v1'
  },

  // ============================================
  // GENERAL SEARCH (1/1 stable)
  // ============================================
  {
    name: 'general_search',
    description: 'Universal search across the Canton Network',
    status: 'stable',
    category: 'General',
    inputSchema: {
      type: 'object',
      properties: {
        arg: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'limit' }
      },
      required: ['arg']
    },
    endpoint: 'general-search',
    version: 'v1'
  },

  // ============================================
  // DEPRECATED ENDPOINTS (404s)
  // ============================================
  {
    name: 'mining_rounds_active',
    description: '[DEPRECATED] Get active mining rounds - This endpoint may no longer be available',
    status: 'deprecated',
    category: 'Mining',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    endpoint: 'mining-rounds/active',
    version: 'v1'
  },
  {
    name: 'mining_rounds_list',
    description: '[DEPRECATED] List mining rounds - This endpoint may no longer be available',
    status: 'deprecated',
    category: 'Mining',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'limit' }
      }
    },
    endpoint: 'mining-rounds',
    version: 'v1'
  },
  {
    name: 'rewards_app',
    description: '[DEPRECATED] Get app rewards - This endpoint may no longer be available',
    status: 'deprecated',
    category: 'Rewards',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'limit' }
      }
    },
    endpoint: 'rewards/app',
    version: 'v1'
  },
  {
    name: 'rewards_validator',
    description: '[DEPRECATED] Get validator rewards - This endpoint may no longer be available',
    status: 'deprecated',
    category: 'Rewards',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'limit' }
      }
    },
    endpoint: 'rewards/validator',
    version: 'v1'
  },
  {
    name: 'rewards_super_validator',
    description: '[DEPRECATED] Get super validator rewards - This endpoint may no longer be available',
    status: 'deprecated',
    category: 'Rewards',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'limit' }
      }
    },
    endpoint: 'rewards/super-validator',
    version: 'v1'
  },

  // ============================================
  // UPDATES v3 (experimental)
  // ============================================
  {
    name: 'updates_list',
    description: '[EXPERIMENTAL] List network updates',
    status: 'experimental',
    category: 'Updates',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'limit' },
        start_datetime: { type: 'string', description: 'Start datetime' },
        end_datetime: { type: 'string', description: 'End datetime' }
      }
    },
    endpoint: 'updates',
    version: 'v3'
  },
  {
    name: 'updates_by_party',
    description: '[EXPERIMENTAL] Get updates for a party',
    status: 'experimental',
    category: 'Updates',
    inputSchema: {
      type: 'object',
      properties: {
        party_id: { type: 'string', description: 'The party ID' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'limit' }
      },
      required: ['party_id']
    },
    endpoint: 'updates/by-party',
    version: 'v3'
  }
];

// Get tools by status
export const getStableTools = () => TOOLS.filter(t => t.status === 'stable');
export const getExperimentalTools = () => TOOLS.filter(t => t.status === 'experimental');
export const getDeprecatedTools = () => TOOLS.filter(t => t.status === 'deprecated');

// Get tools by category
export const getToolsByCategory = (category: string) => TOOLS.filter(t => t.category === category);

// Tool counts
export const getToolCounts = () => ({
  total: TOOLS.length,
  stable: getStableTools().length,
  experimental: getExperimentalTools().length,
  deprecated: getDeprecatedTools().length
});






