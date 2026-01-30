/**
 * MCP Registry
 *
 * Manages registration and lookup of MCP servers and their tools
 */

import { EventEmitter } from 'events';
import { MCPServerInstance, MCPTool, HubEvent } from './types';

export class MCPRegistry extends EventEmitter {
  private servers = new Map<string, MCPServerInstance>();
  private tools = new Map<string, MCPTool & { serverName: string }>();

  async registerServer(server: MCPServerInstance): Promise<void> {
    try {
      // Initialize the server
      await server.initialize();

      // Get available tools
      const tools = await server.listTools();

      // Register server
      this.servers.set(server.name, server);

      // Register tools with server reference
      for (const tool of tools) {
        const toolKey = `${server.name}.${tool.name}`;
        this.tools.set(toolKey, {
          ...tool,
          serverName: server.name,
        });
      }

      console.log(`[mcp-hub] Registered server: ${server.name} with ${tools.length} tools`);

      this.emit('server.registered', {
        type: 'server.registered',
        timestamp: new Date(),
        server: server.name,
        data: { toolCount: tools.length },
      } as HubEvent);
    } catch (error) {
      console.error(`[mcp-hub] Failed to register server ${server.name}:`, error);

      this.emit('server.error', {
        type: 'server.error',
        timestamp: new Date(),
        server: server.name,
        error: error instanceof Error ? error.message : String(error),
      } as HubEvent);

      throw error;
    }
  }

  async unregisterServer(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (server) {
      await server.shutdown();
      this.servers.delete(serverName);

      // Remove tools from this server
      for (const [toolKey, tool] of this.tools.entries()) {
        if (tool.serverName === serverName) {
          this.tools.delete(toolKey);
        }
      }

      console.log(`[mcp-hub] Unregistered server: ${serverName}`);
    }
  }

  getServer(serverName: string): MCPServerInstance | undefined {
    return this.servers.get(serverName);
  }

  getAllServers(): Map<string, MCPServerInstance> {
    return new Map(this.servers);
  }

  getTool(serverName: string, toolName: string): (MCPTool & { serverName: string }) | undefined {
    const toolKey = `${serverName}.${toolName}`;
    return this.tools.get(toolKey);
  }

  getAllTools(): (MCPTool & { serverName: string })[] {
    return Array.from(this.tools.values());
  }

  getToolsByServer(serverName: string): (MCPTool & { serverName: string })[] {
    return Array.from(this.tools.values()).filter((tool) => tool.serverName === serverName);
  }

  searchTools(query: string): (MCPTool & { serverName: string })[] {
    const searchTerm = query.toLowerCase();
    return Array.from(this.tools.values()).filter(
      (tool) =>
        tool.name.toLowerCase().includes(searchTerm) ||
        tool.description.toLowerCase().includes(searchTerm) ||
        tool.serverName.toLowerCase().includes(searchTerm)
    );
  }

  getServerStatus(): { name: string; status: 'active' | 'error'; toolCount: number }[] {
    return Array.from(this.servers.entries()).map(([name]) => ({
      name,
      status: 'active' as const,
      toolCount: this.getToolsByServer(name).length,
    }));
  }

  async shutdown(): Promise<void> {
    console.log('[mcp-hub] Shutting down all MCP servers...');

    const shutdownPromises = Array.from(this.servers.values()).map(async (server) => {
      try {
        await server.shutdown();
        console.log(`[mcp-hub] Shutdown completed for: ${server.name}`);
      } catch (error) {
        console.error(`[mcp-hub] Error shutting down ${server.name}:`, error);
      }
    });

    await Promise.all(shutdownPromises);

    this.servers.clear();
    this.tools.clear();

    console.log('[mcp-hub] All MCP servers shutdown complete');
  }
}
