/**
 * Frexplorer API Client
 * Multi-chain blockchain balance and transaction explorer
 */

const DEFAULT_BASE_URL = 'https://backend-production-2871d.up.railway.app';

export class FrexplorerClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || DEFAULT_BASE_URL;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Frexplorer API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  // ============================================================================
  // Chain Discovery
  // ============================================================================

  async listChains(): Promise<{ chains: any[]; total: number }> {
    return this.request('/api/public/supported-chains');
  }

  async checkChain(chain: string): Promise<{ supported: boolean; chain?: any; supportLevel?: string }> {
    return this.request(`/api/public/check-support?chain=${encodeURIComponent(chain)}`);
  }

  // ============================================================================
  // Balance Queries
  // ============================================================================

  async getBalance(
    address: string,
    chain: string,
    options?: { block?: number; timestamp?: number }
  ): Promise<any> {
    const params = new URLSearchParams({ address, chain });
    if (options?.block) params.append('block', options.block.toString());
    if (options?.timestamp) params.append('timestamp', options.timestamp.toString());
    return this.request(`/api/public/balances?${params}`);
  }

  async getBlockAtTimestamp(chain: string, timestamp: number): Promise<any> {
    const params = new URLSearchParams({ chain, timestamp: timestamp.toString() });
    return this.request(`/api/public/block-at-timestamp?${params}`);
  }

  // ============================================================================
  // Transaction Explorer
  // ============================================================================

  async listTxChains(): Promise<{ chains: any[] }> {
    return this.request('/api/public/transactions/chains');
  }

  async listTransactions(
    address: string,
    chain: string,
    options?: { limit?: number; cursor?: string; from_date?: string; to_date?: string }
  ): Promise<any> {
    const params = new URLSearchParams({ address, chain });
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.cursor) params.append('cursor', options.cursor);
    if (options?.from_date) params.append('from_date', options.from_date);
    if (options?.to_date) params.append('to_date', options.to_date);
    return this.request(`/api/public/transactions?${params}`);
  }

  async listMappings(): Promise<{ mappings: any[] }> {
    return this.request('/api/public/transactions/mappings');
  }

  async exportTransactions(
    address: string,
    chain: string,
    options?: { mapping_id?: string; format?: string }
  ): Promise<any> {
    const params = new URLSearchParams({ address, chain });
    if (options?.mapping_id) params.append('mapping_id', options.mapping_id);
    if (options?.format) params.append('format', options.format);
    return this.request(`/api/public/transactions/export?${params}`);
  }
}
