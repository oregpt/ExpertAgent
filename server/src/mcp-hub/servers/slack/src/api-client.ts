/**
 * Slack API Client
 * Handles Bot Token auth and HTTP requests to Slack Web API
 */

const MAX_RESPONSE_SIZE = 50 * 1024; // 50KB
const BASE_URL = 'https://slack.com/api';

export class SlackApiClient {
  private botToken: string;

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  private truncate(data: any): any {
    const json = JSON.stringify(data);
    if (json.length <= MAX_RESPONSE_SIZE) return data;
    // For list-type responses, trim the main array
    if (data.messages && Array.isArray(data.messages)) {
      const trimmed = [...data.messages];
      while (JSON.stringify({ ...data, messages: trimmed }).length > MAX_RESPONSE_SIZE && trimmed.length > 1) {
        trimmed.pop();
      }
      return { ...data, messages: trimmed, _truncated: true, _totalMessages: data.messages.length };
    }
    if (data.channels && Array.isArray(data.channels)) {
      const trimmed = [...data.channels];
      while (JSON.stringify({ ...data, channels: trimmed }).length > MAX_RESPONSE_SIZE && trimmed.length > 1) {
        trimmed.pop();
      }
      return { ...data, channels: trimmed, _truncated: true };
    }
    if (data.members && Array.isArray(data.members)) {
      const trimmed = [...data.members];
      while (JSON.stringify({ ...data, members: trimmed }).length > MAX_RESPONSE_SIZE && trimmed.length > 1) {
        trimmed.pop();
      }
      return { ...data, members: trimmed, _truncated: true };
    }
    return { _truncated: true, _originalSize: json.length, ok: data.ok };
  }

  async post(method: string, body: Record<string, any> = {}): Promise<{ data?: any; error?: string }> {
    try {
      const resp = await fetch(`${BASE_URL}/${method}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.botToken}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return { error: `HTTP ${resp.status}: ${errText.substring(0, 500)}` };
      }

      const data = await resp.json() as any;
      if (!data.ok) {
        return { error: `Slack API error: ${data.error || 'unknown'}` };
      }

      return { data: this.truncate(data) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Convenience methods for common patterns
  async get(method: string, params: Record<string, string> = {}): Promise<{ data?: any; error?: string }> {
    try {
      const url = new URL(`${BASE_URL}/${method}`);
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') url.searchParams.set(k, v);
      });

      const resp = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.botToken}`,
        },
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return { error: `HTTP ${resp.status}: ${errText.substring(0, 500)}` };
      }

      const data = await resp.json() as any;
      if (!data.ok) {
        return { error: `Slack API error: ${data.error || 'unknown'}` };
      }

      return { data: this.truncate(data) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
}
