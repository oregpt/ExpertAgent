/**
 * CC Explorer Pro MCP Server - Agent-in-a-Box Wrapper
 *
 * Wraps the CC Explorer Pro API for use in Agent-in-a-Box.
 * Provides 14 tools for Canton Network overview, governance, validators, parties, and contracts.
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';
import { CCExplorerClient } from './src/api-client';
import { tools as toolDefinitions } from './src/tools';

export class CCExplorerMCPServer implements MCPServerInstance {
  name = 'ccexplorer';
  version = '1.0.0';
  description = 'CC Explorer Pro (Canton Network) - Query network overview, governance, validators, parties, contracts, and ledger updates.';
  tools: MCPTool[] = [];

  private apiClient: CCExplorerClient | null = null;
  private apiKey: string | null = null;

  /**
   * Set API key for this server instance
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.apiClient = new CCExplorerClient(apiKey);
  }

  async initialize(): Promise<void> {
    // Convert tool definitions to MCPTool format
    this.tools = toolDefinitions.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as z.ZodTypeAny,
    }));
    
    console.log(`[ccexplorer] Initialized with ${this.tools.length} tools`);
    console.log(`[ccexplorer] API Key configured: ${this.apiKey ? 'Yes' : 'No'}`);
  }

  async shutdown(): Promise<void> {
    console.log('[ccexplorer] Shutting down...');
    this.apiClient = null;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    // Check if API key is configured
    if (!this.apiClient) {
      return {
        success: false,
        error: 'CC Explorer Pro API key not configured. Please add your API key in the Capabilities settings.',
      };
    }

    // Find the tool definition
    const tool = toolDefinitions.find((t) => t.name === name);
    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${name}. Available tools: ${toolDefinitions.map((t) => t.name).join(', ')}`,
      };
    }

    try {
      // Validate args with Zod schema
      const validatedArgs = tool.inputSchema.parse(args);
      
      // Execute the tool handler
      const result = await tool.handler(this.apiClient, validatedArgs as any);

      return {
        success: true,
        data: result,
        metadata: {
          tool: name,
        },
      };
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof z.ZodError) {
        const zodError = error as z.ZodError;
        const issues = zodError.issues || [];
        return {
          success: false,
          error: `Invalid arguments: ${issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
          metadata: { tool: name },
        };
      }

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
}

// Export singleton instance
export const ccexplorerServer = new CCExplorerMCPServer();
