/**
 * CC Explorer API Client
 * Base URL: https://pro.ccexplorer.io/api
 * Auth: x-api-key header
 */

const BASE_URL = 'https://pro.ccexplorer.io/api';

export class CCExplorerClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`${BASE_URL}${endpoint}`);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        'x-api-key': this.apiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API Error ${response.status}: ${text}`);
    }

    return response.json();
  }

  // === Consensus ===
  async getConsensus() {
    return this.request<any>('/consensus');
  }

  // === Contracts ===
  async getContract(id: string) {
    return this.request<any>(`/contracts/${encodeURIComponent(id)}`);
  }

  // === Updates (v2) ===
  async getContractUpdates(id: string, limit?: number, offset?: number) {
    return this.request<any>(`/v2/contracts/${encodeURIComponent(id)}/updates`, { limit, offset });
  }

  async getPartyUpdates(id: string, limit?: number, offset?: number) {
    return this.request<any>(`/v2/parties/${encodeURIComponent(id)}/updates`, { limit, offset });
  }

  async getUpdateDetail(updateId: string) {
    return this.request<any>(`/v2/updates/${encodeURIComponent(updateId)}`);
  }

  async getUpdates(limit?: number, offset?: number) {
    return this.request<any>('/v2/updates', { limit, offset });
  }

  // === Rounds ===
  async getCurrentRound() {
    return this.request<any>('/current-round');
  }

  // === Governance ===
  async getGovernanceDetail(trackingCid: string) {
    return this.request<any>(`/governance/${encodeURIComponent(trackingCid)}`);
  }

  async getGovernance() {
    return this.request<any>('/governance');
  }

  // === Overview ===
  async getOverview() {
    return this.request<any>('/overview');
  }

  // === Parties ===
  async getPartyDetail(id: string) {
    return this.request<any>(`/parties/${encodeURIComponent(id)}`);
  }

  // === Search ===
  async search(query: string) {
    return this.request<any>('/search', { q: query });
  }

  // === Validators ===
  async getSuperValidators() {
    return this.request<any>('/super-validators');
  }

  async getValidators() {
    return this.request<any>('/validators');
  }
}
