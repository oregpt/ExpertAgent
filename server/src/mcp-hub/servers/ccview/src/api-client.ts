/**
 * ccview.io API Client
 * Handles all HTTP requests to the Canton Network Explorer API
 */

export interface ApiConfig {
  apiKey: string;
  baseUrl?: string;
  rateLimitMs?: number;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  paging?: {
    offset?: number;
    limit?: number;
    total?: number;
    cursor?: string;
  };
  error?: string;
}

export class CcviewApiClient {
  private apiKey: string;
  private baseUrl: string;
  private rateLimitMs: number;
  private lastRequestTime: number = 0;

  constructor(config: ApiConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://ccview.io/api';
    this.rateLimitMs = config.rateLimitMs || 2000; // 2 second default delay
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.rateLimitMs) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  async request<T>(
    endpoint: string,
    params: Record<string, string | number | undefined> = {},
    version: 'v1' | 'v2' | 'v3' = 'v2'
  ): Promise<ApiResponse<T>> {
    await this.rateLimit();

    // Build URL with query params
    const url = new URL(`${this.baseUrl}/${version}/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        url.searchParams.append(key, String(value));
      }
    });

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Accept': 'application/json',
        },
      });

      // Handle special status codes
      if (response.status === 204) {
        // 204 No Content - typically means "success" (e.g., ANS name available)
        return { data: { available: true, status: 204 } as T };
      }
      
      if (response.status === 409) {
        // 409 Conflict - typically means "taken" (e.g., ANS name taken)
        return { data: { available: false, status: 409 } as T };
      }

      if (!response.ok) {
        const errorText = await response.text();
        return {
          error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`
        };
      }

      const text = await response.text();
      if (!text) {
        return { data: {} as T };
      }
      
      const data = JSON.parse(text);
      return data as ApiResponse<T>;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Convenience methods for each API version
  async v1<T>(endpoint: string, params?: Record<string, string | number | undefined>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, params, 'v1');
  }

  async v2<T>(endpoint: string, params?: Record<string, string | number | undefined>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, params, 'v2');
  }

  async v3<T>(endpoint: string, params?: Record<string, string | number | undefined>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, params, 'v3');
  }
}
