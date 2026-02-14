/**
 * GCP Public Datasets MCP Server - Agent-in-a-Box Wrapper
 *
 * Queries Google BigQuery public datasets (blockchain, weather, COVID, geographic, etc.)
 * Requires: GCP Service Account credentials + Project ID
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';
import { BlockchainAnalyzerClient } from './src/api-client';
import { tools } from './src/tools';

export class GcpPublicDatasetsMCPServer implements MCPServerInstance {
  name = 'gcp-public-datasets';
  version = '1.0.0';
  description = 'Query Google BigQuery public datasets (blockchain, weather, COVID, geographic, etc.) with cost controls';
  tools: MCPTool[] = [];

  private client: BlockchainAnalyzerClient | null = null;

  /**
   * Called by MCPServerManager to inject credentials from database.
   * token1 = GCP Service Account JSON (stringified) or file path
   * token2 = GCP Project ID
   */
  setTokens(tokens: { token1?: string; token2?: string; token3?: string; token4?: string; token5?: string }) {
    if (tokens.token1 && tokens.token2) {
      this.client = new BlockchainAnalyzerClient(tokens.token1, tokens.token2, {
        maxCostPerQueryUSD: 1.0,
        hardCostCapUSD: 5.0,
        maxRows: 10000,
        queryTimeoutSeconds: 30,
      });
      console.log(`[gcp-public-datasets] Credentials configured for project: ${tokens.token2}`);
    }
  }

  async initialize(): Promise<void> {
    this.tools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
    console.log(`[gcp-public-datasets] Initialized with ${this.tools.length} tools`);
  }

  async shutdown(): Promise<void> {
    console.log('[gcp-public-datasets] Shutting down');
    this.client = null;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    if (!this.client) {
      return {
        success: false,
        error: 'GCP credentials not configured. Please set token1 (Service Account JSON) and token2 (Project ID).',
      };
    }

    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${name}. Available: ${tools.map((t) => t.name).join(', ')}`,
      };
    }

    const start = Date.now();
    try {
      const result = await tool.handler(this.client, args as any);
      return {
        success: true,
        data: result,
        metadata: {
          server: this.name,
          tool: name,
          executionTime: Date.now() - start,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          server: this.name,
          tool: name,
          executionTime: Date.now() - start,
        },
      };
    }
  }

  async listTools(): Promise<MCPTool[]> {
    return this.tools;
  }
}

// Export singleton instance
export const gcpPublicDatasetsServer = new GcpPublicDatasetsMCPServer();
