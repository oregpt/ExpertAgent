/**
 * Stdio MCP Server
 *
 * Wrapper that spawns an external MCP server process and communicates via stdio.
 * Implements the MCPServerInstance interface so it can be registered in the MCP Hub.
 *
 * Supports:
 * - NPM packages: "npx -y @modelcontextprotocol/server-github"
 * - Local scripts: "python /path/to/mcp_server.py"
 * - Docker containers: "docker run -i mcp-server-image"
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { MCPServerInstance, MCPTool, MCPResponse } from './types';
import { z } from 'zod';

// JSON-RPC types
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown> | undefined;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// MCP Protocol types
interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface MCPServerInfo {
  name: string;
  version: string;
  capabilities?: Record<string, unknown>;
}

export interface StdioMCPServerConfig {
  id: string;
  name: string;
  description: string;
  command: string; // e.g., "npx", "python", "docker"
  args: string[]; // e.g., ["-y", "@modelcontextprotocol/server-github"]
  env?: Record<string, string>; // Environment variables (for tokens, etc.)
  cwd?: string; // Working directory
  timeout?: number; // Request timeout in ms (default: 30000)
}

export class StdioMCPServer extends EventEmitter implements MCPServerInstance {
  name: string;
  version = '1.0.0';
  description: string;
  tools: MCPTool[] = [];

  private config: StdioMCPServerConfig;
  private process: ChildProcess | null = null;
  private requestId = 1;
  private pendingRequests = new Map<
    number | string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private buffer = '';
  private initialized = false;
  private serverInfo: MCPServerInfo | null = null;

  constructor(config: StdioMCPServerConfig) {
    super();
    this.config = config;
    this.name = config.id;
    this.description = config.description;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log(`[stdio-mcp] Starting MCP server: ${this.config.name}`);
    console.log(`[stdio-mcp] Command: ${this.config.command} ${this.config.args.join(' ')}`);

    try {
      // Spawn the MCP server process
      this.process = spawn(this.config.command, this.config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.config.env },
        cwd: this.config.cwd,
        shell: process.platform === 'win32',
      });

      // Handle stdout (JSON-RPC responses)
      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleData(data.toString());
      });

      // Handle stderr (logging)
      this.process.stderr?.on('data', (data: Buffer) => {
        console.log(`[stdio-mcp:${this.name}:stderr] ${data.toString().trim()}`);
      });

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        console.log(`[stdio-mcp:${this.name}] Process exited with code ${code}, signal ${signal}`);
        this.cleanup();
      });

      // Handle errors
      this.process.on('error', (error) => {
        console.error(`[stdio-mcp:${this.name}] Process error:`, error);
        this.cleanup();
      });

      // Wait for process to be ready
      await this.waitForReady();

      // Initialize MCP protocol
      const initResult = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        clientInfo: {
          name: 'agent-in-a-box',
          version: '1.0.0',
        },
      });

      if (initResult && typeof initResult === 'object' && 'serverInfo' in initResult) {
        this.serverInfo = initResult.serverInfo as MCPServerInfo;
        this.version = this.serverInfo?.version || '1.0.0';
      }

      // Send initialized notification
      await this.sendNotification('notifications/initialized', {});

      // List available tools
      const toolsResult = await this.sendRequest('tools/list', {});

      if (toolsResult && typeof toolsResult === 'object' && 'tools' in toolsResult) {
        const mcpTools = (toolsResult as { tools: MCPToolDefinition[] }).tools;
        this.tools = mcpTools.map((tool) => this.convertTool(tool));
      }

      this.initialized = true;
      console.log(`[stdio-mcp:${this.name}] Initialized with ${this.tools.length} tools`);
      this.tools.forEach((t) => console.log(`[stdio-mcp:${this.name}]   - ${t.name}: ${t.description}`));
    } catch (error) {
      console.error(`[stdio-mcp:${this.name}] Failed to initialize:`, error);
      this.cleanup();
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    console.log(`[stdio-mcp:${this.name}] Shutting down...`);
    this.cleanup();
  }

  async executeTool(name: string, args: unknown): Promise<MCPResponse> {
    if (!this.initialized || !this.process) {
      return {
        success: false,
        error: `MCP server ${this.name} is not initialized`,
      };
    }

    try {
      const result = await this.sendRequest('tools/call', {
        name,
        arguments: args,
      });

      // MCP tools return content array
      if (result && typeof result === 'object' && 'content' in result) {
        const content = (result as { content: unknown[] }).content;

        // Extract text content
        const textContent = content
          .filter((c): c is { type: 'text'; text: string } => typeof c === 'object' && c !== null && 'type' in c && c.type === 'text')
          .map((c) => c.text)
          .join('\n');

        // Check for errors
        if ('isError' in result && result.isError) {
          return {
            success: false,
            error: textContent || 'Tool execution failed',
          };
        }

        return {
          success: true,
          data: textContent || result,
        };
      }

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async listTools(): Promise<MCPTool[]> {
    return this.tools;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for MCP server to be ready'));
      }, 10000);

      // Check if process is running
      if (this.process?.pid) {
        clearTimeout(timeout);
        resolve();
      } else {
        const checkInterval = setInterval(() => {
          if (this.process?.pid) {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            resolve();
          }
        }, 100);
      }
    });
  }

  private handleData(data: string): void {
    this.buffer += data;

    // Process complete JSON-RPC messages (newline-delimited)
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line) as JsonRpcResponse;
          this.handleMessage(message);
        } catch (error) {
          console.error(`[stdio-mcp:${this.name}] Failed to parse JSON:`, line);
        }
      }
    }
  }

  private handleMessage(message: JsonRpcResponse): void {
    if (message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    }
  }

  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.process?.stdin) {
      throw new Error('MCP server process not running');
    }

    const id = this.requestId++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
    };
    if (params !== undefined) {
      request.params = params;
    }

    return new Promise((resolve, reject) => {
      const timeout = this.config.timeout || 30000;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const message = JSON.stringify(request) + '\n';
      this.process!.stdin!.write(message);
    });
  }

  private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    if (!this.process?.stdin) {
      return;
    }

    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.process.stdin.write(JSON.stringify(notification) + '\n');
  }

  private convertTool(mcpTool: MCPToolDefinition): MCPTool {
    // Convert MCP tool definition to our internal format with Zod schema
    const inputSchema = this.buildZodSchema(mcpTool.inputSchema);

    return {
      name: mcpTool.name,
      description: mcpTool.description || `Tool: ${mcpTool.name}`,
      inputSchema,
    };
  }

  private buildZodSchema(schema?: MCPToolDefinition['inputSchema']): z.ZodType<unknown> {
    if (!schema || schema.type !== 'object') {
      return z.any();
    }

    const properties = schema.properties || {};
    const required = new Set(schema.required || []);

    const shape: Record<string, z.ZodType<unknown>> = {};

    for (const [key, prop] of Object.entries(properties)) {
      const propSchema = prop as Record<string, unknown>;
      let fieldSchema: z.ZodType<unknown>;

      switch (propSchema.type) {
        case 'string':
          fieldSchema = z.string();
          if (propSchema.description) {
            fieldSchema = fieldSchema.describe(propSchema.description as string);
          }
          break;
        case 'number':
        case 'integer':
          fieldSchema = z.number();
          break;
        case 'boolean':
          fieldSchema = z.boolean();
          break;
        case 'array':
          fieldSchema = z.array(z.any());
          break;
        case 'object':
          fieldSchema = z.record(z.string(), z.any());
          break;
        default:
          fieldSchema = z.any();
      }

      if (!required.has(key)) {
        fieldSchema = fieldSchema.optional();
      }

      shape[key] = fieldSchema;
    }

    return z.object(shape);
  }

  private cleanup(): void {
    // Cancel all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('MCP server shutting down'));
    }
    this.pendingRequests.clear();

    // Kill the process
    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.initialized = false;
    this.buffer = '';
  }
}
