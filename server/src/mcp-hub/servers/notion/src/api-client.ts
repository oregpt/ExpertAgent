/**
 * Notion API Client
 * Handles Integration Token auth and HTTP requests to Notion API
 */

const MAX_RESPONSE_SIZE = 50 * 1024; // 50KB
const BASE_URL = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

export class NotionApiClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private truncate(data: any): any {
    const json = JSON.stringify(data);
    if (json.length <= MAX_RESPONSE_SIZE) return data;
    // For paginated results, trim the results array
    if (data.results && Array.isArray(data.results)) {
      const trimmed = [...data.results];
      while (JSON.stringify({ ...data, results: trimmed }).length > MAX_RESPONSE_SIZE && trimmed.length > 1) {
        trimmed.pop();
      }
      return { ...data, results: trimmed, _truncated: true, _totalResults: data.results.length };
    }
    return { _truncated: true, _originalSize: json.length };
  }

  async request(
    method: string,
    path: string,
    body?: any,
    query?: Record<string, string>
  ): Promise<{ data?: any; error?: string }> {
    try {
      const url = new URL(`${BASE_URL}${path}`);
      if (query) {
        Object.entries(query).forEach(([k, v]) => {
          if (v !== undefined && v !== '') url.searchParams.set(k, v);
        });
      }

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Notion-Version': NOTION_VERSION,
        'Accept': 'application/json',
      };
      if (body) headers['Content-Type'] = 'application/json';

      const resp = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

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
