/**
 * Google Calendar API Client
 * Handles OAuth2 auth, token refresh, and HTTP requests
 */

const MAX_RESPONSE_SIZE = 50 * 1024; // 50KB
const BASE_URL = 'https://www.googleapis.com/calendar/v3';

export interface GCalTokens {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

export class GoogleCalendarApiClient {
  private tokens: GCalTokens;

  constructor(tokens: GCalTokens) {
    this.tokens = tokens;
  }

  private async refreshAccessToken(): Promise<boolean> {
    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.tokens.refreshToken,
        client_id: this.tokens.clientId,
        client_secret: this.tokens.clientSecret,
      });

      const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!resp.ok) return false;

      const data = await resp.json() as any;
      if (data.access_token) {
        this.tokens.accessToken = data.access_token;
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
    if (Array.isArray(data)) {
      // Trim array items until under limit
      const trimmed = [...data];
      while (JSON.stringify(trimmed).length > MAX_RESPONSE_SIZE && trimmed.length > 1) {
        trimmed.pop();
      }
      return { items: trimmed, _truncated: true, _totalItems: data.length };
    }
    return { _truncated: true, _originalSize: json.length, summary: JSON.stringify(data).substring(0, MAX_RESPONSE_SIZE) };
  }

  async request(
    method: string,
    path: string,
    body?: any,
    query?: Record<string, string>
  ): Promise<{ data?: any; error?: string }> {
    const doRequest = async (): Promise<Response> => {
      const url = new URL(`${BASE_URL}${path}`);
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

      if (resp.status === 401) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          resp = await doRequest();
        } else {
          return { error: 'Authentication failed. Please re-authorize Google Calendar.' };
        }
      }

      if (resp.status === 204) return { data: { success: true } };

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
}
