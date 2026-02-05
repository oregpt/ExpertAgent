/**
 * ChatScraper MCP Server - Telegram and Slack channel scraping
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';

// This is a placeholder - actual implementation would connect to your scraper service
const BASE_URL = 'https://chatscraper-service.agenticledger.ai';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, any>; required: string[] };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'scrape_telegram',
    description: 'Scrape messages from a Telegram channel',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Telegram channel username or ID' },
        limit: { type: 'number', description: 'Number of messages to scrape (default: 100)' },
      },
      required: ['channel'],
    },
  },
  {
    name: 'list_telegram_channels',
    description: 'List configured Telegram channels',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'scrape_slack',
    description: 'Scrape messages from a Slack channel (requires workspace access)',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Slack channel ID or name' },
        limit: { type: 'number', description: 'Number of messages to scrape (default: 100)' },
      },
      required: ['channel'],
    },
  },
  {
    name: 'list_slack_channels',
    description: 'List configured Slack channels',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

export class ChatScraperMCPServer implements MCPServerInstance {
  name = 'chatscraper';
  version = '1.0.0';
  description = 'ChatScraper - Scrape messages from Telegram and Slack channels.';
  tools: MCPTool[] = [];
  private telegramToken?: string;
  private slackToken?: string;

  setTokens(tokens: { token1?: string; token2?: string }): void {
    this.telegramToken = tokens.token1;
    this.slackToken = tokens.token2;
    console.log('[chatscraper] Tokens configured');
  }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((t) => this.convertTool(t));
    console.log(`[chatscraper] Initialized with ${this.tools.length} tools`);
  }

  async shutdown(): Promise<void> {}
  async listTools(): Promise<MCPTool[]> { return this.tools; }

  private convertTool(tool: ToolDefinition): MCPTool {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, prop] of Object.entries(tool.inputSchema.properties || {})) {
      let field: z.ZodTypeAny = prop.type === 'number' ? z.number() : z.string();
      if (!tool.inputSchema.required?.includes(key)) field = field.optional();
      shape[key] = field;
    }
    return { name: tool.name, description: tool.description, inputSchema: z.object(shape) };
  }

  private async request(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) url.searchParams.append(k, String(v)); });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.telegramToken) headers['X-Telegram-Token'] = this.telegramToken;
    if (this.slackToken) headers['X-Slack-Token'] = this.slackToken;
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) throw new Error(`ChatScraper API error ${res.status}`);
    return res.json();
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    try {
      switch (name) {
        case 'scrape_telegram': {
          if (!this.telegramToken) throw new Error('Telegram token not configured');
          const channel = args.channel as string;
          const limit = Number(args.limit) || 100;
          const data = await this.request('/telegram/scrape', { channel, limit });
          return { success: true, data: { channel, messages: data.messages, count: data.messages?.length || 0 } };
        }
        case 'list_telegram_channels': {
          const data = await this.request('/telegram/channels');
          return { success: true, data: { channels: data.channels || [] } };
        }
        case 'scrape_slack': {
          if (!this.slackToken) throw new Error('Slack token not configured');
          const channel = args.channel as string;
          const limit = Number(args.limit) || 100;
          const data = await this.request('/slack/scrape', { channel, limit });
          return { success: true, data: { channel, messages: data.messages, count: data.messages?.length || 0 } };
        }
        case 'list_slack_channels': {
          const data = await this.request('/slack/channels');
          return { success: true, data: { channels: data.channels || [] } };
        }
        default: return { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
  }
}

export const chatScraperServer = new ChatScraperMCPServer();
