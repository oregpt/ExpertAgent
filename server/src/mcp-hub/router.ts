/**
 * MCP Router
 *
 * Routes tool calls to the appropriate MCP server with validation
 */

import { MCPRegistry } from './registry';
import { MCPResponse } from './types';

export class MCPRouter {
  constructor(private registry: MCPRegistry) {}

  async routeToolCall(serverName: string, toolName: string, toolArgs: any): Promise<MCPResponse> {
    // Get the target server
    const server = this.registry.getServer(serverName);
    if (!server) {
      return {
        success: false,
        error: `Server '${serverName}' not found. Available servers: ${Array.from(
          this.registry.getAllServers().keys()
        ).join(', ')}`,
      };
    }

    // Get the tool definition for validation
    const tool = this.registry.getTool(serverName, toolName);
    if (!tool) {
      const availableTools = this.registry.getToolsByServer(serverName).map((t) => t.name);
      return {
        success: false,
        error: `Tool '${toolName}' not found on server '${serverName}'. Available tools: ${availableTools.join(
          ', '
        )}`,
      };
    }

    // Validate arguments using Zod schema
    try {
      const validatedArgs = tool.inputSchema.parse(toolArgs);

      // Execute the tool on the server
      const result = await server.executeTool(toolName, validatedArgs);

      return result;
    } catch (error) {
      if (error instanceof Error && 'issues' in error) {
        // Zod validation error
        return {
          success: false,
          error: `Invalid arguments for ${serverName}.${toolName}: ${error.message}`,
        };
      }

      // Server execution error
      return {
        success: false,
        error: `Error executing ${serverName}.${toolName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  // Route with automatic server discovery based on tool name
  async routeByTool(toolName: string, toolArgs: any, preferredServer?: string): Promise<MCPResponse> {
    // Try preferred server first
    if (preferredServer) {
      const tool = this.registry.getTool(preferredServer, toolName);
      if (tool) {
        return await this.routeToolCall(preferredServer, toolName, toolArgs);
      }
    }

    // Find servers that have this tool
    const availableTools = this.registry.getAllTools().filter((t) => t.name === toolName);

    if (availableTools.length === 0) {
      return {
        success: false,
        error: `Tool '${toolName}' not found on any registered server`,
      };
    }

    if (availableTools.length === 1) {
      // Only one server has this tool
      const tool = availableTools[0];
      if (tool && tool.serverName) {
        return await this.routeToolCall(tool.serverName, toolName, toolArgs);
      }
    }

    // Multiple servers have this tool - need disambiguation
    const serverNames = availableTools.map((t) => t.serverName).filter(Boolean);
    return {
      success: false,
      error: `Tool '${toolName}' found on multiple servers: ${serverNames.join(
        ', '
      )}. Please specify server name.`,
    };
  }

  // Batch routing for multiple tool calls
  async routeBatch(
    calls: Array<{ server?: string; tool: string; arguments: any }>,
    parallel = false
  ): Promise<MCPResponse[]> {
    const routeCall = async (call: { server?: string; tool: string; arguments: any }) => {
      if (call.server) {
        return await this.routeToolCall(call.server, call.tool, call.arguments);
      } else {
        return await this.routeByTool(call.tool, call.arguments);
      }
    };

    if (parallel) {
      return await Promise.all(calls.map(routeCall));
    } else {
      const results: MCPResponse[] = [];
      for (const call of calls) {
        const result = await routeCall(call);
        results.push(result);

        // Stop on first error in sequential mode
        if (!result.success) {
          break;
        }
      }
      return results;
    }
  }

  // Get routing statistics
  getRoutingStats() {
    const servers = this.registry.getAllServers();
    const tools = this.registry.getAllTools();

    const stats = {
      totalServers: servers.size,
      totalTools: tools.length,
      toolsByServer: {} as Record<string, number>,
      duplicateTools: {} as Record<string, string[]>,
    };

    // Count tools by server
    for (const [serverName] of servers) {
      stats.toolsByServer[serverName] = this.registry.getToolsByServer(serverName).length;
    }

    // Find duplicate tools across servers
    const toolCounts = new Map<string, string[]>();
    for (const tool of tools) {
      const serverList = toolCounts.get(tool.name) || [];
      serverList.push(tool.serverName);
      toolCounts.set(tool.name, serverList);
    }

    for (const [toolName, serverList] of toolCounts) {
      if (serverList.length > 1) {
        stats.duplicateTools[toolName] = serverList;
      }
    }

    return stats;
  }
}
