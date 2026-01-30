/**
 * Deep Tools — Barrel File
 *
 * Exports all "deep tool" definitions and a unified executor.
 * Deep tools are tools beyond the basic MCP Hub capabilities:
 *   - web__search  — Brave web search
 *   - web__fetch   — Fetch and extract URL content
 *
 * Gated by the `deepTools` feature flag.
 * Follows the same pattern as memoryTools.ts.
 */

import { Tool, ToolCall } from '../llm/types';
import { WEB_SEARCH_TOOL, executeWebSearch } from './webSearch';
import { WEB_FETCH_TOOL, executeWebFetch } from './webFetch';

// ============================================================================
// Tool Definitions
// ============================================================================

export const DEEP_TOOLS: Tool[] = [
  WEB_SEARCH_TOOL,
  WEB_FETCH_TOOL,
];

/**
 * Get all deep tool definitions (same format as getMemoryToolDefinitions)
 * Called by toolExecutor to include in the tools sent to the LLM.
 */
export function getDeepToolDefinitions(): Tool[] {
  return DEEP_TOOLS;
}

// ============================================================================
// Tool Detection & Execution
// ============================================================================

const DEEP_TOOL_NAMES = new Set(DEEP_TOOLS.map(t => t.name));

/**
 * Check if a tool name is a deep tool
 */
export function isDeepTool(toolName: string): boolean {
  return DEEP_TOOL_NAMES.has(toolName);
}

/**
 * Execute a deep tool call and return the result string.
 * Routes to the appropriate handler based on tool name.
 */
export async function executeDeepTool(
  toolCall: ToolCall
): Promise<{ success: boolean; output: string }> {
  switch (toolCall.name) {
    case 'web__search':
      return executeWebSearch(toolCall.input);

    case 'web__fetch':
      return executeWebFetch(toolCall.input);

    default:
      return {
        success: false,
        output: `Unknown deep tool: ${toolCall.name}`,
      };
  }
}
