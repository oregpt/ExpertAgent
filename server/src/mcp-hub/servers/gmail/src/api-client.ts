/**
 * Gmail API Client
 * Handles OAuth2 token refresh and Gmail v1 API calls
 */

export class GmailApiClient {
  private accessToken: string;
  private refreshToken?: string;
  private clientId?: string;
  private clientSecret?: string;
  private baseUrl = 'https://gmail.googleapis.com/gmail/v1/users/me';

  constructor(opts: {
    accessToken: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
  }) {
    this.accessToken = opts.accessToken;
    this.refreshToken = opts.refreshToken;
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken || !this.clientId || !this.clientSecret) return false;
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.access_token) {
        this.accessToken = data.access_token;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async request(path: string, options: { method?: string; body?: any; query?: Record<string, string> } = {}): Promise<any> {
    const method = options.method || 'GET';
    let url = `${this.baseUrl}${path}`;

    if (options.query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== '') params.append(k, v);
      }
      const qs = params.toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }

    const fetchOpts: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    };
    if (options.body) fetchOpts.body = JSON.stringify(options.body);

    let res = await fetch(url, fetchOpts);

    if (res.status === 401) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        (fetchOpts.headers as Record<string, string>).Authorization = `Bearer ${this.accessToken}`;
        res = await fetch(url, fetchOpts);
      }
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gmail API error ${res.status}: ${errText.slice(0, 500)}`);
    }

    return res.json();
  }
}
