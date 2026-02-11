/**
 * Tool Executor
 *
 * Handles the tool calling loop:
 * 1. Get available tools for an agent
 * 2. Call LLM with tools
 * 3. Execute tool calls via MCP Hub
 * 4. Loop until final text response
 */

import { LLMMessage, Tool, GenerateResult, ToolCall, GenerateOptions } from './types';
import { getProviderForModel } from './index';
import { getOrchestrator } from '../mcp-hub';
import { getMCPServerManager } from '../mcp-hub/mcp-server-manager';
import { getFeatures, isCapabilityAllowed } from '../licensing/features';
import { getAgentFeatures } from '../licensing/agentFeatures';
import { MEMORY_TOOLS, isMemoryTool, executeMemoryTool } from '../memory/memoryTools';
import { DEEP_TOOLS, isDeepTool, executeDeepTool } from '../tools/deepTools';
import { CRON_TOOLS, isCronTool, executeCronTool } from '../tools/cronTools';
import { AGENT_TOOLS, isAgentTool, executeAgentTool } from '../tools/agentTools';
import { BROWSER_TOOLS, isBrowserTool, executeBrowserTool } from '../tools/browserTools';
import { FILESYSTEM_TOOLS, isFilesystemTool, executeFilesystemTool } from '../tools/filesystemTools';

const MAX_TOOL_ITERATIONS = 10;

export interface ToolExecutorOptions {
  model: string;
  maxTokens?: number;
  agentId: string;
  enableTools?: boolean;
  /** Callback when a tool is being called (for streaming progress) */
  onToolCall?: (toolName: string) => void;
}

export interface ToolExecutorResult {
  reply: string;
  toolsUsed: Array<{
    name: string;
    input: Record<string, unknown>;
    output: string;
    success: boolean;
  }>;
}

/**
 * Get available tools for an agent
 * Tool names are prefixed with server name to ensure uniqueness
 */
export async function getToolsForAgent(agentId: string): Promise<Tool[]> {
  const orchestrator = getOrchestrator();
  const allTools = orchestrator.getAllTools();

  // Convert MCP tools to LLM tool format
  // Namespace tool names with server name to avoid conflicts
  return allTools.map((tool) => ({
    name: `${tool.server}__${tool.name}`,
    description: `[${tool.server}] ${tool.description}`,
    serverName: tool.server,
    inputSchema: {
      type: 'object' as const,
      properties: {}, // The MCP Hub already validated schemas
      required: [],
    },
  }));
}

/**
 * Get detailed tools with full schemas
 * Only includes tools from capabilities that are enabled for the agent
 */
export async function getDetailedToolsForAgent(agentId: string): Promise<Tool[]> {
  const orchestrator = getOrchestrator();
  const registry = orchestrator.serverRegistry;
  const tools: Tool[] = [];

  // Get enabled capabilities for this agent (dynamic — no hardcoded mappings)
  // Three-layer gate: (1) license allows capability, (2) globally enabled, (3) agent-enabled
  const { capabilityService } = await import('../capabilities');
  const enabledCaps = await capabilityService.getAgentCapabilities(agentId);
  const licensedAndEnabled = enabledCaps.filter(c => c.agentEnabled && isCapabilityAllowed(c.id));
  const enabledCapIds = new Set(licensedAndEnabled.map(c => c.id));
  
  console.log('[tool-executor] Licensed + enabled capability IDs:', Array.from(enabledCapIds));
  
  // Dynamically resolve capability IDs → MCP server names from DB config
  // Each capability record has config.serverName for MCP-type capabilities
  // AnyAPI-type capabilities route to the 'anyapi' server
  const enabledServers = new Set<string>();
  for (const cap of licensedAndEnabled) {
    if (cap.type === 'mcp') {
      // MCP capabilities store their server name in config.serverName
      const serverName = (cap.config as any)?.serverName;
      if (serverName) {
        enabledServers.add(serverName);
      } else {
        // Fallback: derive server name from capability ID (e.g., 'mcp-ccview' → 'ccview')
        const derived = cap.id.replace(/^mcp-/, '');
        enabledServers.add(derived);
        console.warn(`[tool-executor] Capability '${cap.id}' missing config.serverName, derived: '${derived}'`);
      }
    } else if (cap.type === 'anyapi') {
      // All AnyAPI capabilities route through the 'anyapi' MCP server
      enabledServers.add('anyapi');
    }
  }
  
  console.log('[tool-executor] Enabled servers:', Array.from(enabledServers));
  
  // ══════════════════════════════════════════════════════════════════════
  // ONE TOOL PER MCP SERVER (Expert Agent pattern)
  //
  // Instead of sending every individual MCP method as a separate tool
  // (which overwhelms the prompt), we create ONE tool per MCP server.
  // The tool has an `action` enum listing available commands.
  // The LLM picks the server + action + params, then we route it.
  //
  // Example: Instead of 30 separate ccview tools, we send:
  //   mcp__ccview(action: "get_validators" | "get_governance" | ..., params: {...})
  //
  // This keeps the tool count manageable regardless of how many MCP
  // servers are connected or how many methods each server exposes.
  // ══════════════════════════════════════════════════════════════════════
  
  const allMcpTools = registry.getAllTools().filter(t => enabledServers.has(t.serverName));
  
  // Group tools by server
  const toolsByServer = new Map<string, typeof allMcpTools>();
  for (const tool of allMcpTools) {
    const existing = toolsByServer.get(tool.serverName) || [];
    existing.push(tool);
    toolsByServer.set(tool.serverName, existing);
  }
  
  console.log('[tool-executor] MCP servers with tools:', Array.from(toolsByServer.keys()).join(', '));
  
  // Create ONE tool per MCP server
  for (const [serverName, serverTools] of toolsByServer) {
    // Build action enum from available tool names
    const actionNames = serverTools.map(t => t.name);
    
    // Build a concise description of available actions
    const actionDescriptions = serverTools
      .map(t => {
        const desc = t.description.length > 60 ? t.description.slice(0, 57) + '...' : t.description;
        return `  - ${t.name}: ${desc}`;
      })
      .join('\n');
    
    // Find the capability that maps to this server (for display name)
    const matchingCap = enabledCaps.find(c => {
      if (c.type === 'mcp') {
        const cfgServer = (c.config as any)?.serverName;
        return cfgServer === serverName || c.id.replace(/^mcp-/, '') === serverName;
      }
      return false;
    });
    const displayName = matchingCap?.name || serverName;
    
    tools.push({
      name: `mcp__${serverName}`,
      description: `[MCP: ${displayName}] Execute an action on this service.\n\nAvailable actions:\n${actionDescriptions}`,
      serverName,
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: `Action to execute. One of: ${actionNames.join(', ')}`,
            enum: actionNames,
          },
          params: {
            type: 'object',
            description: 'Parameters for the action (varies by action). Pass relevant key-value pairs.',
          },
        },
        required: ['action'],
      },
    });
  }
  
  console.log('[tool-executor] Total MCP server tools:', toolsByServer.size, '(from', allMcpTools.length, 'individual methods)');

  // v2: Add memory tools if soulMemory feature is enabled (per-agent)
  const features = await getAgentFeatures(agentId);
  if (features.soulMemory) {
    tools.push(...MEMORY_TOOLS);
    console.log('[tool-executor] Added memory tools:', MEMORY_TOOLS.map(t => t.name).join(', '));
  }

  // v2: Add deep tools if deepTools feature is enabled (per-agent)
  if (features.deepTools) {
    tools.push(...DEEP_TOOLS);
    console.log('[tool-executor] Added deep tools:', DEEP_TOOLS.map(t => t.name).join(', '));
  }

  // v2: Add cron tools if proactive feature is enabled (per-agent)
  if (features.proactive) {
    tools.push(...CRON_TOOLS);
    console.log('[tool-executor] Added cron tools:', CRON_TOOLS.map(t => t.name).join(', '));
  }

  // v2: Add agent spawn tools if backgroundAgents feature is enabled (per-agent)
  if (features.backgroundAgents) {
    tools.push(...AGENT_TOOLS);
    console.log('[tool-executor] Added agent tools:', AGENT_TOOLS.map(t => t.name).join(', '));
  }

  // v2: Add browser tools if deepTools feature is enabled (per-agent)
  // Browser tools share the deepTools gate — they're "deep" tools for web interaction
  if (features.deepTools) {
    tools.push(...BROWSER_TOOLS);
    console.log('[tool-executor] Added browser tools:', BROWSER_TOOLS.map(t => t.name).join(', '));
  }

  // v2: Add filesystem tools if deepTools feature is enabled (per-agent)
  // Filesystem tools also share the deepTools gate — they're "deep" tools for local file access
  // Only enabled in desktop mode (IS_DESKTOP env var set by Electron)
  if (features.deepTools && process.env.IS_DESKTOP === 'true') {
    tools.push(...FILESYSTEM_TOOLS);
    console.log('[tool-executor] Added filesystem tools:', FILESYSTEM_TOOLS.map(t => t.name).join(', '));
  }

  return tools;
}

/**
 * Execute a single tool call via the MCP Hub
 */
async function executeTool(
  serverName: string,
  toolName: string,
  input: Record<string, unknown>,
  agentId?: string
): Promise<{ success: boolean; output: string }> {
  const orchestrator = getOrchestrator();
  const context = agentId ? { agentId } : undefined;

  try {
    const result = await orchestrator.executeAction(serverName, toolName, input, context);

    if (result.success) {
      return {
        success: true,
        output: typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2),
      };
    } else {
      return {
        success: false,
        output: result.error || 'Tool execution failed',
      };
    }
  } catch (error) {
    return {
      success: false,
      output: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Parse a namespaced tool name (server__toolname) into its components
 */
function parseNamespacedTool(namespacedName: string): { serverName: string; toolName: string } | null {
  const parts = namespacedName.split('__');
  if (parts.length !== 2) {
    return null;
  }
  return { serverName: parts[0]!, toolName: parts[1]! };
}

/**
 * Find the server name for a tool
 */
function findServerForTool(toolName: string, tools: Tool[]): string | undefined {
  const tool = tools.find((t) => t.name === toolName);
  return tool?.serverName;
}

/**
 * Execute a full conversation with tool calling loop
 */
export async function executeWithTools(
  messages: LLMMessage[],
  options: ToolExecutorOptions
): Promise<ToolExecutorResult> {
  const provider = getProviderForModel(options.model);
  const toolsUsed: ToolExecutorResult['toolsUsed'] = [];

  // Get available tools if enabled
  let tools: Tool[] = [];
  if (options.enableTools !== false) {
    tools = await getDetailedToolsForAgent(options.agentId);
  }

  // If no tools available, just do a simple generation
  if (tools.length === 0) {
    const generateOpts: GenerateOptions = {
      model: options.model,
      agentId: options.agentId,
    };
    if (options.maxTokens !== undefined) {
      generateOpts.maxTokens = options.maxTokens;
    }
    const reply = await provider.generate(messages, generateOpts);
    return { reply, toolsUsed: [] };
  }

  // Tool calling loop
  let currentMessages = [...messages];
  let iterations = 0;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    // Call LLM with tools
    const toolOpts: GenerateOptions = {
      model: options.model,
      agentId: options.agentId,
      tools,
    };
    if (options.maxTokens !== undefined) {
      toolOpts.maxTokens = options.maxTokens;
    }
    const result = await provider.generateWithTools(currentMessages, toolOpts);

    // If we got a text response, we're done
    if (result.type === 'text' || !result.toolCalls || result.toolCalls.length === 0) {
      return { reply: result.text || '', toolsUsed };
    }

    // Execute each tool call
    const toolResultMessages: LLMMessage[] = [];

    for (const toolCall of result.toolCalls) {
      // Notify caller about tool execution (for streaming progress)
      if (options.onToolCall) {
        options.onToolCall(toolCall.name);
      }

      // v2: Check if this is a memory tool first
      if (isMemoryTool(toolCall.name)) {
        const memResult = await executeMemoryTool(options.agentId, toolCall);
        
        const MAX_OUTPUT = 20000;
        let output = memResult.output;
        if (output.length > MAX_OUTPUT) {
          output = output.slice(0, MAX_OUTPUT) + '\n\n[OUTPUT TRUNCATED]';
        }
        
        toolResultMessages.push({
          role: 'tool',
          content: output,
          toolCallId: toolCall.id,
        });
        toolsUsed.push({
          name: toolCall.name,
          input: toolCall.input,
          output,
          success: memResult.success,
        });
        continue;
      }

      // v2: Check if this is a deep tool (web__search, web__fetch)
      if (isDeepTool(toolCall.name)) {
        const deepResult = await executeDeepTool(toolCall, options.agentId);
        
        const MAX_OUTPUT = 20000;
        let output = deepResult.output;
        if (output.length > MAX_OUTPUT) {
          output = output.slice(0, MAX_OUTPUT) + '\n\n[OUTPUT TRUNCATED]';
        }
        
        toolResultMessages.push({
          role: 'tool',
          content: output,
          toolCallId: toolCall.id,
        });
        toolsUsed.push({
          name: toolCall.name,
          input: toolCall.input,
          output,
          success: deepResult.success,
        });
        continue;
      }

      // v2: Check if this is a cron tool (cron__schedule, cron__list, etc.)
      if (isCronTool(toolCall.name)) {
        const cronResult = await executeCronTool(options.agentId, toolCall);
        
        toolResultMessages.push({
          role: 'tool',
          content: cronResult.output,
          toolCallId: toolCall.id,
        });
        toolsUsed.push({
          name: toolCall.name,
          input: toolCall.input,
          output: cronResult.output,
          success: cronResult.success,
        });
        continue;
      }

      // v2: Check if this is an agent tool (agent__spawn_task)
      if (isAgentTool(toolCall.name)) {
        const agentResult = await executeAgentTool(options.agentId, toolCall);
        
        const MAX_OUTPUT = 20000;
        let output = agentResult.output;
        if (output.length > MAX_OUTPUT) {
          output = output.slice(0, MAX_OUTPUT) + '\n\n[OUTPUT TRUNCATED]';
        }
        
        toolResultMessages.push({
          role: 'tool',
          content: output,
          toolCallId: toolCall.id,
        });
        toolsUsed.push({
          name: toolCall.name,
          input: toolCall.input,
          output,
          success: agentResult.success,
        });
        continue;
      }

      // v2: Check if this is a browser tool (browser__navigate, browser__click, etc.)
      if (isBrowserTool(toolCall.name)) {
        const browserResult = await executeBrowserTool(options.agentId, toolCall);
        
        const MAX_OUTPUT = 20000;
        let output = browserResult.output;
        if (output.length > MAX_OUTPUT) {
          output = output.slice(0, MAX_OUTPUT) + '\n\n[OUTPUT TRUNCATED]';
        }
        
        toolResultMessages.push({
          role: 'tool',
          content: output,
          toolCallId: toolCall.id,
        });
        toolsUsed.push({
          name: toolCall.name,
          input: toolCall.input,
          output,
          success: browserResult.success,
        });
        continue;
      }

      // v2: Check if this is a filesystem tool (fs__read_file, fs__write_file, etc.)
      if (isFilesystemTool(toolCall.name)) {
        const fsResult = await executeFilesystemTool(options.agentId, toolCall);
        
        const MAX_OUTPUT = 20000;
        let output = fsResult.output;
        if (output.length > MAX_OUTPUT) {
          output = output.slice(0, MAX_OUTPUT) + '\n\n[OUTPUT TRUNCATED]';
        }
        
        toolResultMessages.push({
          role: 'tool',
          content: output,
          toolCallId: toolCall.id,
        });
        toolsUsed.push({
          name: toolCall.name,
          input: toolCall.input,
          output,
          success: fsResult.success,
        });
        continue;
      }

      // ════════════════════════════════════════════════════════════════
      // MCP Server Tools (one-tool-per-server pattern)
      //
      // Tool name format: mcp__<serverName>
      // Input: { action: "tool_name", params: { ... } }
      // Routes to: orchestrator.executeAction(serverName, action, params)
      // ════════════════════════════════════════════════════════════════
      if (toolCall.name.startsWith('mcp__')) {
        const serverName = toolCall.name.replace('mcp__', '');
        const action = toolCall.input.action as string;
        const params = (toolCall.input.params as Record<string, unknown>) || {};

        if (!action) {
          toolResultMessages.push({
            role: 'tool',
            content: 'Error: Missing "action" parameter. Specify which action to execute.',
            toolCallId: toolCall.id,
          });
          toolsUsed.push({
            name: toolCall.name,
            input: toolCall.input,
            output: 'Missing action parameter',
            success: false,
          });
          continue;
        }

        console.log(`[tool-executor] MCP call: ${serverName}.${action} (agent: ${options.agentId})`, JSON.stringify(params).slice(0, 200));
        const toolResult = await executeTool(serverName, action, params, options.agentId);

        // Truncate large outputs
        const MAX_TOOL_OUTPUT_CHARS = 20000;
        let truncatedOutput = toolResult.output;
        if (truncatedOutput.length > MAX_TOOL_OUTPUT_CHARS) {
          truncatedOutput = truncatedOutput.slice(0, MAX_TOOL_OUTPUT_CHARS) + '\n\n[OUTPUT TRUNCATED]';
          console.log(`[tool-executor] Truncated output for ${serverName}.${action}: ${toolResult.output.length} -> ${truncatedOutput.length} chars`);
        }

        toolResultMessages.push({
          role: 'tool',
          content: truncatedOutput,
          toolCallId: toolCall.id,
        });
        toolsUsed.push({
          name: `${serverName}.${action}`,
          input: params,
          output: truncatedOutput,
          success: toolResult.success,
        });
        continue;
      }

      // ════════════════════════════════════════════════════════════════
      // Legacy: direct server__toolname format (backward compat)
      // ════════════════════════════════════════════════════════════════
      const parsed = parseNamespacedTool(toolCall.name);

      if (!parsed) {
        toolResultMessages.push({
          role: 'tool',
          content: `Error: Tool '${toolCall.name}' not found. Available tool prefixes: memory__, cron__, agent__, browser__, mcp__, web__`,
          toolCallId: toolCall.id,
        });
        toolsUsed.push({
          name: toolCall.name,
          input: toolCall.input,
          output: `Tool not found`,
          success: false,
        });
        continue;
      }

      // Execute with the actual tool name (not namespaced)
      const toolResult = await executeTool(parsed.serverName, parsed.toolName, toolCall.input, options.agentId);

      const MAX_TOOL_OUTPUT_CHARS = 20000;
      let truncatedOutput = toolResult.output;
      if (truncatedOutput.length > MAX_TOOL_OUTPUT_CHARS) {
        truncatedOutput = truncatedOutput.slice(0, MAX_TOOL_OUTPUT_CHARS) + '\n\n[OUTPUT TRUNCATED]';
      }

      toolResultMessages.push({
        role: 'tool',
        content: truncatedOutput,
        toolCallId: toolCall.id,
      });
      toolsUsed.push({
        name: toolCall.name,
        input: toolCall.input,
        output: truncatedOutput,
        success: toolResult.success,
      });
    }

    // Add assistant message with tool_use blocks (required by Claude API)
    currentMessages.push({
      role: 'assistant',
      content: result.text || '',
      toolCalls: result.toolCalls, // Include the tool calls
    });

    // Add tool results
    currentMessages = currentMessages.concat(toolResultMessages);
  }

  // If we hit max iterations, return what we have
  return {
    reply: 'I was unable to complete the task within the allowed number of tool calls.',
    toolsUsed,
  };
}
