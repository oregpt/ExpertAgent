/**
 * Google Sheets API Client
 * Handles OAuth2 token refresh and Sheets v4 API calls
 */

export class GoogleSheetsApiClient {
  private accessToken: string;
  private refreshToken?: string;
  private clientId?: string;
  private clientSecret?: string;
  private baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';

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
    let url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

    if (options.query) {
      const params = new URLSearchParams(options.query);
      url += (url.includes('?') ? '&' : '?') + params.toString();
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

    // Auto-refresh on 401
    if (res.status === 401) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        (fetchOpts.headers as Record<string, string>).Authorization = `Bearer ${this.accessToken}`;
        res = await fetch(url, fetchOpts);
      }
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Google Sheets API error ${res.status}: ${errText.slice(0, 500)}`);
    }

    return res.json();
  }
}
