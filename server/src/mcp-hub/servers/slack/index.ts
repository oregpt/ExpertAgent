/**
 * Slack MCP Server - Agent-in-a-Box Wrapper
 *
 * Provides tools for interacting with Slack workspaces:
 * channels, messages, users, search, reactions, and threads.
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';
import { SlackApiClient } from './src/api-client';
import { TOOLS, ToolDefinition } from './src/tools';

export class SlackMCPServer implements MCPServerInstance {
  name = 'slack';
  version = '1.0.0';
  description = 'Slack — List channels, read/post messages, reply to threads, search, manage reactions, and get user info.';
  tools: MCPTool[] = [];

  private apiClient: SlackApiClient | null = null;
  private tokens: {
    token1?: string; // bot_token
  } = {};

  setApiKey(apiKey: string): void {
    this.tokens.token1 = apiKey;
    this.apiClient = new SlackApiClient(apiKey);
  }

  setTokens(tokens: { token1?: string; token2?: string; token3?: string; token4?: string; token5?: string }): void {
    if (tokens.token1) {
      this.tokens.token1 = tokens.token1;
      this.apiClient = new SlackApiClient(tokens.token1);
    }
  }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((tool) => this.convertTool(tool));
    console.log(`[slack] Initialized with ${this.tools.length} tools`);
  }

  async shutdown(): Promise<void> {
    console.log('[slack] Shutting down...');
    this.apiClient = null;
  }

  async executeTool(name: string, args: Record<string, any>): Promise<MCPResponse> {
    if (!this.apiClient) {
      return {
        success: false,
        error: 'Slack not configured. Please add your Bot Token in Capabilities settings.',
      };
    }

    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }

    try {
      let result: { data?: any; error?: string };

      switch (name) {
        case 'list_channels':
          result = await this.apiClient.post('conversations.list', {
            types: args.types || 'public_channel,private_channel',
            limit: args.limit || 100,
            exclude_archived: args.exclude_archived !== false,
          });
          break;

        case 'get_channel_history': {
          const params: any = { channel: args.channel, limit: args.limit || 20 };
          if (args.oldest) params.oldest = args.oldest;
          if (args.latest) params.latest = args.latest;
          result = await this.apiClient.post('conversations.history', params);
          break;
        }

        case 'post_message': {
          const params: any = { channel: args.channel, text: args.text };
          if (args.blocks) {
            params.blocks = typeof args.blocks === 'string' ? JSON.parse(args.blocks) : args.blocks;
          }
          if (args.unfurl_links !== undefined) params.unfurl_links = args.unfurl_links;
          result = await this.apiClient.post('chat.postMessage', params);
          break;
        }

        case 'reply_to_thread':
          result = await this.apiClient.post('chat.postMessage', {
            channel: args.channel,
            thread_ts: args.thread_ts,
            text: args.text,
          });
          break;

        case 'get_user_info':
          result = await this.apiClient.post('users.info', { user: args.user });
          break;

        case 'list_users':
          result = await this.apiClient.post('users.list', { limit: args.limit || 100 });
          break;

        case 'search_messages':
          result = await this.apiClient.post('search.messages', {
            query: args.query,
            count: args.count || 20,
            sort: args.sort || 'score',
          });
          break;

        case 'set_channel_topic':
          result = await this.apiClient.post('conversations.setTopic', {
            channel: args.channel,
            topic: args.topic,
          });
          break;

        case 'add_reaction':
          result = await this.apiClient.post('reactions.add', {
            channel: args.channel,
            timestamp: args.timestamp,
            name: args.name,
          });
          break;

        case 'get_permalink':
          result = await this.apiClient.post('chat.getPermalink', {
            channel: args.channel,
            message_ts: args.message_ts,
          });
          break;

        default:
          return { success: false, error: `Unhandled tool: ${name}` };
      }

      if (result.error) {
        return { success: false, error: result.error, metadata: { tool: name } };
      }
      return { success: true, data: result.data, metadata: { tool: name, server: 'slack' } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), metadata: { tool: name } };
    }
  }

  async listTools(): Promise<MCPTool[]> {
    return this.tools;
  }

  private convertTool(tool: ToolDefinition): MCPTool {
    const schemaShape: Record<string, z.ZodTypeAny> = {};
    for (const [key, prop] of Object.entries(tool.inputSchema.properties || {})) {
      let field: z.ZodTypeAny;
      switch (prop.type) {
        case 'string': field = prop.enum ? z.enum(prop.enum as [string, ...string[]]) : z.string(); break;
        case 'number': field = z.number(); break;
        case 'boolean': field = z.boolean(); break;
        default: field = z.any();
      }
      if (!tool.inputSchema.required?.includes(key)) field = field.optional();
      schemaShape[key] = field;
    }
    return { name: tool.name, description: tool.description, inputSchema: z.object(schemaShape) };
  }
}

export const slackServer = new SlackMCPServer();
