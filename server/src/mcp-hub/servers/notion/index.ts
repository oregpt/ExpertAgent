/**
 * Notion MCP Server - Agent-in-a-Box Wrapper
 *
 * Provides tools for interacting with Notion workspaces:
 * search, pages, databases, blocks, and content management.
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';
import { NotionApiClient } from './src/api-client';
import { TOOLS, ToolDefinition } from './src/tools';

export class NotionMCPServer implements MCPServerInstance {
  name = 'notion';
  version = '1.0.0';
  description = 'Notion — Search, read, create, and update pages and databases. Query databases with filters.';
  tools: MCPTool[] = [];

  private apiClient: NotionApiClient | null = null;
  private tokens: {
    token1?: string; // api_key (integration token)
  } = {};

  setApiKey(apiKey: string): void {
    this.tokens.token1 = apiKey;
    this.apiClient = new NotionApiClient(apiKey);
  }

  setTokens(tokens: { token1?: string; token2?: string; token3?: string; token4?: string; token5?: string }): void {
    if (tokens.token1) {
      this.tokens.token1 = tokens.token1;
      this.apiClient = new NotionApiClient(tokens.token1);
    }
  }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((tool) => this.convertTool(tool));
    console.log(`[notion] Initialized with ${this.tools.length} tools`);
  }

  async shutdown(): Promise<void> {
    console.log('[notion] Shutting down...');
    this.apiClient = null;
  }

  async executeTool(name: string, args: Record<string, any>): Promise<MCPResponse> {
    if (!this.apiClient) {
      return {
        success: false,
        error: 'Notion not configured. Please add your Integration Token in Capabilities settings.',
      };
    }

    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }

    try {
      let result: { data?: any; error?: string };

      switch (name) {
        case 'search': {
          const body: any = {};
          if (args.query) body.query = args.query;
          if (args.filter_type) body.filter = { value: args.filter_type, property: 'object' };
          if (args.page_size) body.page_size = args.page_size;
          if (args.sort_direction) body.sort = { direction: args.sort_direction, timestamp: 'last_edited_time' };
          result = await this.apiClient.request('POST', '/search', body);
          break;
        }

        case 'get_page':
          result = await this.apiClient.request('GET', `/pages/${args.page_id}`);
          break;

        case 'get_database':
          result = await this.apiClient.request('GET', `/databases/${args.database_id}`);
          break;

        case 'query_database': {
          const body: any = {};
          if (args.filter) body.filter = typeof args.filter === 'string' ? JSON.parse(args.filter) : args.filter;
          if (args.sorts) body.sorts = typeof args.sorts === 'string' ? JSON.parse(args.sorts) : args.sorts;
          if (args.page_size) body.page_size = args.page_size;
          if (args.start_cursor) body.start_cursor = args.start_cursor;
          result = await this.apiClient.request('POST', `/databases/${args.database_id}/query`, body);
          break;
        }

        case 'create_page': {
          const properties = typeof args.properties === 'string' ? JSON.parse(args.properties) : args.properties;
          const body: any = {
            parent: { database_id: args.database_id },
            properties,
          };
          if (args.content) {
            body.children = typeof args.content === 'string' ? JSON.parse(args.content) : args.content;
          }
          result = await this.apiClient.request('POST', '/pages', body);
          break;
        }

        case 'update_page': {
          const body: any = {};
          if (args.properties) {
            body.properties = typeof args.properties === 'string' ? JSON.parse(args.properties) : args.properties;
          }
          if (args.archived !== undefined) body.archived = args.archived;
          result = await this.apiClient.request('PATCH', `/pages/${args.page_id}`, body);
          break;
        }

        case 'get_block_children': {
          const query: Record<string, string> = {};
          if (args.page_size) query.page_size = String(args.page_size);
          if (args.start_cursor) query.start_cursor = args.start_cursor;
          result = await this.apiClient.request('GET', `/blocks/${args.block_id}/children`, undefined, query);
          break;
        }

        case 'append_blocks': {
          const children = typeof args.children === 'string' ? JSON.parse(args.children) : args.children;
          result = await this.apiClient.request('PATCH', `/blocks/${args.block_id}/children`, { children });
          break;
        }

        default:
          return { success: false, error: `Unhandled tool: ${name}` };
      }

      if (result.error) {
        return { success: false, error: result.error, metadata: { tool: name } };
      }
      return { success: true, data: result.data, metadata: { tool: name, server: 'notion' } };
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

export const notionServer = new NotionMCPServer();
