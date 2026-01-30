/**
 * Lighthouse Explorer MCP Server - Agent-in-a-Box Wrapper
 *
 * Wraps the Lighthouse (CantonLoop) Canton Network Explorer API.
 * Provides 28 tools for Canton Network queries.
 * NO API KEY REQUIRED - Public API
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';
import { LighthouseClient } from './src/api-client';
import { tools } from './src/tools';

// Type for tool handlers
type ToolDefinition = typeof tools[number];

export class LighthouseMCPServer implements MCPServerInstance {
  name = 'lighthouse';
  version = '1.0.0';
  description = 'Lighthouse Explorer (CantonLoop) - Query Canton Network: CNS, contracts, governance, validators, parties, prices, rounds, stats, transactions, transfers. NO API KEY REQUIRED.';
  tools: MCPTool[] = [];

  private apiClient: LighthouseClient;

  constructor() {
    // No API key needed - public API
    this.apiClient = new LighthouseClient();
  }

  async initialize(): Promise<void> {
    // Convert tool definitions to MCPTool format
    this.tools = tools.map((tool) => this.convertTool(tool));
    
    console.log(`[lighthouse] Initialized with ${this.tools.length} tools`);
    console.log(`[lighthouse] Public API - No API key required`);
  }

  async shutdown(): Promise<void> {
    console.log('[lighthouse] Shutting down...');
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    // Find the tool definition
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${name}. Available tools: ${tools.map((t) => t.name).join(', ')}`,
      };
    }

    try {
      // Execute the tool handler
      const result = await tool.handler(this.apiClient, args as any);

      return {
        success: true,
        data: result,
        metadata: {
          tool: name,
          server: 'lighthouse',
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

  private convertTool(tool: typeof tools[0]): MCPTool {
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    };
  }
}

// Export singleton instance
export const lighthouseServer = new LighthouseMCPServer();
