/**
 * QuickBooks Online API Client
 * Handles OAuth2 auth, token refresh, and HTTP requests
 */

const MAX_RESPONSE_SIZE = 50 * 1024; // 50KB

export interface QBTokens {
  accessToken: string;
  refreshToken: string;
  realmId: string;
  clientId: string;
  clientSecret: string;
}

export class QuickBooksApiClient {
  private tokens: QBTokens;
  private baseUrl: string;

  constructor(tokens: QBTokens) {
    this.tokens = tokens;
    this.baseUrl = `https://quickbooks.api.intuit.com/v3/company/${tokens.realmId}`;
  }

  private async refreshAccessToken(): Promise<boolean> {
    try {
      const basicAuth = Buffer.from(`${this.tokens.clientId}:${this.tokens.clientSecret}`).toString('base64');
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.tokens.refreshToken,
      });

      const resp = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: body.toString(),
      });

      if (!resp.ok) return false;

      const data = await resp.json() as any;
      if (data.access_token) {
        this.tokens.accessToken = data.access_token;
        if (data.refresh_token) this.tokens.refreshToken = data.refresh_token;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private truncate(data: any): any {
    const json = JSON.stringify(data);
    if (json.length <= MAX_RESPONSE_SIZE) return data;
    return {
      _truncated: true,
      _originalSize: json.length,
      data: JSON.parse(json.slice(0, MAX_RESPONSE_SIZE - 100) + '..."}}'),
    };
  }

  async request(method: string, endpoint: string, body?: any, query?: Record<string, string>): Promise<{ data?: any; error?: string }> {
    const doRequest = async (): Promise<Response> => {
      const url = new URL(`${this.baseUrl}/${endpoint}`);
      if (query) {
        Object.entries(query).forEach(([k, v]) => {
          if (v !== undefined && v !== '') url.searchParams.set(k, v);
        });
      }

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.tokens.accessToken}`,
        'Accept': 'application/json',
      };
      if (body) headers['Content-Type'] = 'application/json';

      return fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    };

    try {
      let resp = await doRequest();

      // Auto-refresh on 401
      if (resp.status === 401) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          resp = await doRequest();
        } else {
          return { error: 'Authentication failed. Please re-authorize QuickBooks.' };
        }
      }

      if (!resp.ok) {
        const errText = await resp.text();
        return { error: `HTTP ${resp.status}: ${errText.substring(0, 500)}` };
      }

      const text = await resp.text();
      if (!text) return { data: {} };
      const data = JSON.parse(text);
      return { data: this.truncate(data) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  async query(entity: string, queryStr?: string): Promise<{ data?: any; error?: string }> {
    const q = queryStr || `SELECT * FROM ${entity} MAXRESULTS 100`;
    return this.request('GET', 'query', undefined, { query: q });
  }

  async get(endpoint: string): Promise<{ data?: any; error?: string }> {
    return this.request('GET', endpoint);
  }

  async post(endpoint: string, body: any): Promise<{ data?: any; error?: string }> {
    return this.request('POST', endpoint, body);
  }
}
