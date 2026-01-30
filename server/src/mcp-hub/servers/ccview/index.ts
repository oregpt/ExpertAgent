/**
 * CCView MCP Server - Agent-in-a-Box Wrapper
 *
 * Wraps the ccview.io Canton Network Explorer API for use in Agent-in-a-Box.
 * Provides 49 tools for governance, validators, ANS, transfers, and more.
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';
import { CcviewApiClient } from './src/api-client';
import { TOOLS, ToolDefinition } from './src/tools';

export class CCViewMCPServer implements MCPServerInstance {
  name = 'ccview';
  version = '1.0.0';
  description = 'Canton Network Explorer (ccview.io) - Query governance, validators, ANS names, token transfers, offers, rewards, and network statistics.';
  tools: MCPTool[] = [];

  private apiClient: CcviewApiClient | null = null;
  private apiKey: string | null = null;

  /**
   * Set API key for this server instance
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.apiClient = new CcviewApiClient({ apiKey });
  }

  async initialize(): Promise<void> {
    // Convert tool definitions to MCPTool format
    this.tools = TOOLS.map((tool) => this.convertTool(tool));
    
    console.log(`[ccview] Initialized with ${this.tools.length} tools`);
    console.log(`[ccview] API Key configured: ${this.apiKey ? 'Yes' : 'No'}`);
  }

  async shutdown(): Promise<void> {
    console.log('[ccview] Shutting down...');
    this.apiClient = null;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    // Check if API key is configured
    if (!this.apiClient) {
      return {
        success: false,
        error: 'CCView API key not configured. Please add your API key in the Capabilities settings.',
      };
    }

    // Find the tool definition
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${name}. Available tools: ${TOOLS.map((t) => t.name).join(', ')}`,
      };
    }

    // Warn about deprecated tools
    if (tool.status === 'deprecated') {
      console.warn(`[ccview] Tool '${name}' is deprecated and may not work`);
    }

    try {
      // Build the endpoint URL with path params
      let endpoint = tool.endpoint;
      const queryParams: Record<string, string | number | undefined> = {};

      // Replace path parameters and collect query params
      if (args) {
        for (const [key, value] of Object.entries(args)) {
          if (endpoint.includes(`{${key}}`)) {
            endpoint = endpoint.replace(`{${key}}`, String(value));
          } else {
            queryParams[key] = value as string | number;
          }
        }
      }

      // Make the API request
      const response = await this.apiClient.request(endpoint, queryParams, tool.version);

      if (response.error) {
        return {
          success: false,
          error: response.error,
          metadata: {
            tool: name,
            status: tool.status,
            hint: tool.status === 'deprecated'
              ? 'This endpoint may no longer be available in the API'
              : tool.status === 'experimental'
              ? 'This endpoint may require specific parameters'
              : undefined,
          },
        };
      }

      return {
        success: true,
        data: response,
        metadata: {
          tool: name,
          category: tool.category,
          status: tool.status,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: { tool: name },
      };
    }
  }

  async listTools(): Promise<MCPTool[]> {
    return this.tools;
  }

  private convertTool(tool: ToolDefinition): MCPTool {
    // Build a simple Zod object schema dynamically
    const schemaShape: Record<string, z.ZodTypeAny> = {};

    for (const [key, prop] of Object.entries(tool.inputSchema.properties || {})) {
      let fieldSchema: z.ZodTypeAny;

      switch (prop.type) {
        case 'string':
          if (prop.enum) {
            fieldSchema = z.enum(prop.enum as [string, ...string[]]);
          } else {
            fieldSchema = z.string();
          }
          break;
        case 'number':
          fieldSchema = z.number();
          break;
        case 'boolean':
          fieldSchema = z.boolean();
          break;
        default:
          fieldSchema = z.any();
      }

      // Make optional if not in required array
      if (!tool.inputSchema.required?.includes(key)) {
        fieldSchema = fieldSchema.optional();
      }

      schemaShape[key] = fieldSchema;
    }

    // Add status prefix to description
    const statusPrefix = {
      stable: '',
      experimental: '⚠️ [EXPERIMENTAL] ',
      deprecated: '❌ [DEPRECATED] '
    };

    return {
      name: tool.name,
      description: `${statusPrefix[tool.status]}${tool.description} [Category: ${tool.category}]`,
      inputSchema: z.object(schemaShape),
    };
  }
}

// Export singleton instance
export const ccviewServer = new CCViewMCPServer();
