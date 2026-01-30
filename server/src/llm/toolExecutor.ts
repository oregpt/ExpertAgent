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
import { getFeatures } from '../licensing/features';
import { MEMORY_TOOLS, isMemoryTool, executeMemoryTool } from '../memory/memoryTools';

const MAX_TOOL_ITERATIONS = 10;

export interface ToolExecutorOptions {
  model: string;
  maxTokens?: number;
  agentId: string;
  enableTools?: boolean;
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

  // Get enabled capabilities for this agent
  const { capabilityService } = await import('../capabilities');
  const enabledCaps = await capabilityService.getAgentCapabilities(agentId);
  const enabledCapIds = new Set(enabledCaps.filter(c => c.agentEnabled).map(c => c.id));
  
  console.log('[tool-executor] Enabled capability IDs:', Array.from(enabledCapIds));
  
  // Map capability IDs to server names
  const capToServer: Record<string, string> = {
    'mcp-ccview': 'ccview',
    'mcp-ccexplorer-pro': 'ccexplorer',
    'mcp-lighthouse': 'lighthouse',
    'anyapi': 'anyapi',
    'coingecko': 'anyapi',
  };
  
  // Get enabled server names
  const enabledServers = new Set<string>();
  for (const capId of enabledCapIds) {
    const serverName = capToServer[capId];
    if (serverName) {
      enabledServers.add(serverName);
    }
  }
  
  console.log('[tool-executor] Enabled servers:', Array.from(enabledServers));
  
  // Get all tools but filter to only enabled servers
  // Limit to avoid token overflow while keeping useful tools
  const MAX_TOOLS = 20;
  let allTools = registry.getAllTools().filter(t => enabledServers.has(t.serverName));
  
  console.log('[tool-executor] Filtered tools count:', allTools.length);
  
  // ALWAYS limit - prioritize key tools
  // Prioritize governance, validators, overview, statistics, round tools
  const priorityKeywords = ['governance', 'validator', 'overview', 'statistics', 'list_active', 'super', 'round', 'network', 'current', 'consensus', 'search'];
  allTools.sort((a, b) => {
    const aScore = priorityKeywords.filter(k => a.name.toLowerCase().includes(k)).length;
    const bScore = priorityKeywords.filter(k => b.name.toLowerCase().includes(k)).length;
    return bScore - aScore;
  });
  allTools = allTools.slice(0, MAX_TOOLS);
  console.log('[tool-executor] Limited to', allTools.length, 'tools:', allTools.map(t => t.name).join(', '));
  for (const tool of allTools) {
    // Convert Zod schema to JSON schema for LLM
    const inputSchema = tool.inputSchema;
    let properties: Record<string, any> = {};
    let required: string[] = [];

    // Try to extract schema shape if it's a Zod object
    try {
      if (inputSchema && typeof inputSchema === 'object' && '_def' in inputSchema) {
        const def = (inputSchema as any)._def;
        if (def.typeName === 'ZodObject' && def.shape) {
          const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
          for (const [key, value] of Object.entries(shape)) {
            const fieldDef = (value as any)?._def;
            // Keep parameter descriptions minimal (just the key name if description is verbose)
            const paramDesc = fieldDef?.description || key;
            properties[key] = {
              type: fieldDef?.typeName === 'ZodString' ? 'string' :
                    fieldDef?.typeName === 'ZodNumber' ? 'number' :
                    fieldDef?.typeName === 'ZodBoolean' ? 'boolean' :
                    'string',
              // Truncate to 30 chars max to save tokens
              description: paramDesc.length > 30 ? paramDesc.slice(0, 30) : paramDesc,
            };
            // Check if required (not optional)
            if (fieldDef?.typeName !== 'ZodOptional') {
              required.push(key);
            }
          }
        }
      }
    } catch (e) {
      // If schema extraction fails, use empty properties
      console.warn(`[tool-executor] Could not extract schema for ${tool.name}:`, e);
    }

    // Truncate description to save tokens (max 100 chars)
    const desc = tool.description.length > 100 
      ? tool.description.slice(0, 97) + '...' 
      : tool.description;
    
    tools.push({
      name: `${tool.serverName}__${tool.name}`,
      description: `[${tool.serverName}] ${desc}`,
      serverName: tool.serverName,
      inputSchema: {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
      },
    });
  }

  // v2: Add memory tools if soulMemory feature is enabled
  const features = getFeatures();
  if (features.soulMemory) {
    tools.push(...MEMORY_TOOLS);
    console.log('[tool-executor] Added memory tools:', MEMORY_TOOLS.map(t => t.name).join(', '));
  }

  return tools;
}

/**
 * Execute a single tool call via the MCP Hub
 */
async function executeTool(
  serverName: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<{ success: boolean; output: string }> {
  const orchestrator = getOrchestrator();

  try {
    const result = await orchestrator.executeAction(serverName, toolName, input);

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

      // Parse the namespaced tool name (server__toolname)
      const parsed = parseNamespacedTool(toolCall.name);

      if (!parsed) {
        // Fallback: try legacy non-namespaced lookup
        const serverName = findServerForTool(toolCall.name, tools);
        if (!serverName) {
          toolResultMessages.push({
            role: 'tool',
            content: `Error: Tool '${toolCall.name}' not found`,
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
        // Execute with non-namespaced name
        const toolResult = await executeTool(serverName, toolCall.name, toolCall.input);
        
        // Truncate large outputs
        const MAX_OUTPUT = 20000;
        let output = toolResult.output;
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
          output: output,
          success: toolResult.success,
        });
        continue;
      }

      // Execute with the actual tool name (not namespaced)
      const toolResult = await executeTool(parsed.serverName, parsed.toolName, toolCall.input);

      // Truncate large tool outputs to prevent token overflow
      const MAX_TOOL_OUTPUT_CHARS = 20000; // ~5k tokens
      let truncatedOutput = toolResult.output;
      if (truncatedOutput.length > MAX_TOOL_OUTPUT_CHARS) {
        truncatedOutput = truncatedOutput.slice(0, MAX_TOOL_OUTPUT_CHARS) + '\n\n[OUTPUT TRUNCATED - showing first 20k chars]';
        console.log(`[tool-executor] Truncated output for ${parsed.toolName}: ${toolResult.output.length} -> ${truncatedOutput.length} chars`);
      }

      toolResultMessages.push({
        role: 'tool',
        content: truncatedOutput,
        toolCallId: toolCall.id,
      });

      toolsUsed.push({
        name: toolCall.name,
        input: toolCall.input,
        output: toolResult.output,
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
