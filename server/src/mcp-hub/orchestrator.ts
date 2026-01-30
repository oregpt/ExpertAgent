/**
 * MCP Orchestrator
 *
 * Central orchestration engine for the MCP Hub
 * Manages server lifecycle, action execution, and event emission
 */

import { EventEmitter } from 'events';
import { MCPRegistry } from './registry';
import { MCPRouter } from './router';
import {
  MCPResponse,
  AgentRequest,
  AgentResponse,
  ActionResult,
  HubConfig,
  MCPServerInstance,
} from './types';

export class MCPOrchestrator extends EventEmitter {
  private registry: MCPRegistry;
  private router: MCPRouter;
  private config: HubConfig;

  constructor(config: HubConfig) {
    super();
    this.config = config;
    this.registry = new MCPRegistry();
    this.router = new MCPRouter(this.registry);

    // Forward registry events
    this.registry.on('server.registered', (event) => this.emit('hub.event', event));
    this.registry.on('server.error', (event) => this.emit('hub.event', event));
  }

  get serverRegistry(): MCPRegistry {
    return this.registry;
  }

  // Register a new MCP server
  async registerServer(server: MCPServerInstance): Promise<void> {
    await this.registry.registerServer(server);
  }

  // Execute a single tool call
  async executeAction(serverName: string, toolName: string, toolArgs: any): Promise<MCPResponse> {
    const startTime = Date.now();

    try {
      this.emit('hub.event', {
        type: 'tool.called',
        timestamp: new Date(),
        server: serverName,
        tool: toolName,
        data: { arguments: toolArgs },
      });

      const response = await this.router.routeToolCall(serverName, toolName, toolArgs);

      const executionTime = Date.now() - startTime;
      const enrichedResponse: MCPResponse = {
        ...response,
        metadata: {
          server: serverName,
          tool: toolName,
          executionTime,
        },
      };

      this.emit('hub.event', {
        type: 'tool.completed',
        timestamp: new Date(),
        server: serverName,
        tool: toolName,
        data: { success: response.success, executionTime },
      });

      return enrichedResponse;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorResponse: MCPResponse = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          server: serverName,
          tool: toolName,
          executionTime,
        },
      };

      this.emit('hub.event', {
        type: 'tool.completed',
        timestamp: new Date(),
        server: serverName,
        tool: toolName,
        error: errorResponse.error,
      });

      return errorResponse;
    }
  }

  // Execute multiple actions in sequence or parallel
  async executeActions(
    actions: Array<{ server: string; tool: string; arguments: any }>,
    parallel = false
  ): Promise<ActionResult[]> {
    if (parallel) {
      const promises = actions.map(async (action) => {
        const response = await this.executeAction(action.server, action.tool, action.arguments);
        return {
          server: action.server,
          tool: action.tool,
          arguments: action.arguments,
          response,
          success: response.success,
        };
      });

      return await Promise.all(promises);
    } else {
      const results: ActionResult[] = [];

      for (const action of actions) {
        const response = await this.executeAction(action.server, action.tool, action.arguments);
        results.push({
          server: action.server,
          tool: action.tool,
          arguments: action.arguments,
          response,
          success: response.success,
        });

        // Stop on error if not parallel
        if (!response.success) {
          break;
        }
      }

      return results;
    }
  }

  // Get comprehensive hub status
  getHubStatus() {
    const servers = this.registry.getServerStatus();
    const totalTools = this.registry.getAllTools().length;

    return {
      name: this.config.name,
      version: this.config.version,
      servers,
      totalServers: servers.length,
      totalTools,
      activeServers: servers.filter((s) => s.status === 'active').length,
      timestamp: new Date().toISOString(),
    };
  }

  // Search across all tools
  searchTools(query: string) {
    return this.registry.searchTools(query);
  }

  // Get all available tools
  getAllTools() {
    return this.registry.getAllTools().map((tool) => ({
      server: tool.serverName,
      name: tool.name,
      description: tool.description,
    }));
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    console.log('[mcp-hub] Shutting down MCP Hub Orchestrator...');
    await this.registry.shutdown();
    console.log('[mcp-hub] MCP Hub Orchestrator shutdown complete');
  }
}

// Singleton instance
let orchestratorInstance: MCPOrchestrator | null = null;

export function getOrchestrator(): MCPOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new MCPOrchestrator({
      name: 'agent-in-a-box-hub',
      version: '1.0.0',
    });
  }
  return orchestratorInstance;
}

export function resetOrchestrator(): void {
  if (orchestratorInstance) {
    orchestratorInstance.shutdown().catch(console.error);
    orchestratorInstance = null;
  }
}
