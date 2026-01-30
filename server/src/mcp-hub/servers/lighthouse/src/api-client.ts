/**
 * Lighthouse Explorer API Client (CantonLoop)
 * 
 * Base URL: https://lighthouse.cantonloop.com/api
 * No API key required (public API)
 */

const BASE_URL = 'https://lighthouse.cantonloop.com/api';

export class LighthouseClient {
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
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API Error ${response.status}: ${text}`);
    }

    return response.json();
  }

  // CNS
  async listCns(limit?: number, cursor?: string, direction?: string) {
    return this.request<any>('/cns', { limit, cursor, direction });
  }

  async getCns(domainName: string) {
    return this.request<any>(`/cns/${encodeURIComponent(domainName)}`);
  }

  // Contracts
  async listContracts(limit?: number, cursor?: number, direction?: string) {
    return this.request<any>('/contracts', { limit, cursor, direction });
  }

  async getContract(id: string) {
    return this.request<any>(`/contracts/${encodeURIComponent(id)}`);
  }

  // Featured Apps
  async getFeaturedApps() {
    return this.request<any>('/featured-apps');
  }

  // Governance
  async listGovernance() {
    return this.request<any>('/governance');
  }

  async getGovernanceStats() {
    return this.request<any>('/governance/stats');
  }

  async getGovernance(id: string) {
    return this.request<any>(`/governance/${encodeURIComponent(id)}`);
  }

  // Me
  async getMe() {
    return this.request<any>('/me');
  }

  // Party
  async getPartyBalance(id: string) {
    return this.request<any>(`/parties/${encodeURIComponent(id)}/balance`);
  }

  async getPartyBurns(id: string, limit?: number, cursor_id?: number, direction?: string) {
    return this.request<any>(`/parties/${encodeURIComponent(id)}/burns`, { limit, cursor_id, direction });
  }

  async getPartyPnl(id: string, limit?: number, cursor_round?: number, direction?: string) {
    return this.request<any>(`/parties/${encodeURIComponent(id)}/pnl`, { limit, cursor_round, direction });
  }

  async getPartyRewards(id: string, limit?: number, cursor_id?: number, direction?: string) {
    return this.request<any>(`/parties/${encodeURIComponent(id)}/rewards`, { limit, cursor_id, direction });
  }

  async getPartyBurnStats(id: string, start_time?: string, end_time?: string) {
    return this.request<any>(`/parties/${encodeURIComponent(id)}/stats/burns`, { start_time, end_time });
  }

  async getPartyRewardStats(id: string, start_time?: string, end_time?: string) {
    return this.request<any>(`/parties/${encodeURIComponent(id)}/stats/rewards`, { start_time, end_time });
  }

  async getPartyTransfers(
    id: string,
    sender?: string,
    receiver?: string,
    time_start?: string,
    time_end?: string,
    limit?: number,
    cursor?: number,
    direction?: string
  ) {
    return this.request<any>(`/parties/${encodeURIComponent(id)}/transfers`, {
      sender, receiver, time_start, time_end, limit, cursor, direction
    });
  }

  async getPartyTransactions(id: string, limit?: number, cursor?: number, direction?: string) {
    return this.request<any>(`/parties/${encodeURIComponent(id)}/tx`, { limit, cursor, direction });
  }

  // Preapprovals
  async listPreapprovals(limit?: number, cursor?: number, address?: string, direction?: string) {
    return this.request<any>('/preapprovals', { limit, cursor, address, direction });
  }

  // Prices
  async getPrice() {
    return this.request<any>('/prices');
  }

  async getPriceRange(instrument?: string, tz?: string) {
    return this.request<any>('/prices/range', { instrument, tz });
  }

  // Rounds
  async listRounds(before?: number, limit?: number) {
    return this.request<any>('/rounds', { before, limit });
  }

  async getRound(number: number) {
    return this.request<any>(`/rounds/${number}`);
  }

  // Search
  async search(q: string) {
    return this.request<any>('/search', { q });
  }

  // Stats
  async getStats() {
    return this.request<any>('/stats');
  }

  async getLatestRounds() {
    return this.request<any>('/stats/rounds/latest');
  }

  // Super Validators
  async listSuperValidators() {
    return this.request<any>('/sv');
  }

  // Transactions
  async listTransactions(limit?: number, cursor?: string, direction?: string) {
    return this.request<any>('/transactions', { limit, cursor, direction });
  }

  async getTransaction(updateId: string) {
    return this.request<any>(`/transactions/${encodeURIComponent(updateId)}`);
  }

  // Transfers
  async listTransfers(time_start?: string, time_end?: string, limit?: number, cursor?: number, direction?: string) {
    return this.request<any>('/transfers', { time_start, time_end, limit, cursor, direction });
  }

  async getTransfer(id: string) {
    return this.request<any>(`/transfers/${encodeURIComponent(id)}`);
  }

  // Validators
  async listValidators() {
    return this.request<any>('/validators');
  }

  async getValidator(id: string) {
    return this.request<any>(`/validators/${encodeURIComponent(id)}`);
  }
}
