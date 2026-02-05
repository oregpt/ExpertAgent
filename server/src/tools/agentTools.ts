/**
 * Agent Tools
 *
 * Tools that let the LLM spawn background sub-tasks.
 * Wires into the existing backgroundAgent.ts backend.
 *
 * Tools:
 *   agent__spawn_task(task, timeout)  — spawn an isolated background task
 */

import { Tool, ToolCall } from '../llm/types';
import { spawnTask } from '../proactive/backgroundAgent';

// ============================================================================
// Tool Definitions
// ============================================================================

export const AGENT_TOOLS: Tool[] = [
  {
    name: 'agent__spawn_task',
    description:
      '[agent] Spawn an isolated background task. The task runs in its own conversation context with full tool access. Use for: long-running research, parallel work, tasks that need isolation. Returns the result when complete.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'The task description / prompt for the background agent',
        },
        timeout_seconds: {
          type: 'number',
          description: 'Max execution time in seconds (default: 120, max: 600)',
        },
      },
      required: ['task'],
    },
  },
];

// ============================================================================
// Tool Detection & Execution
// ============================================================================

const AGENT_TOOL_NAMES = new Set(AGENT_TOOLS.map((t) => t.name));

export function isAgentTool(toolName: string): boolean {
  return AGENT_TOOL_NAMES.has(toolName);
}

export async function executeAgentTool(
  agentId: string,
  toolCall: ToolCall
): Promise<{ success: boolean; output: string }> {
  const action = toolCall.name.replace('agent__', '');
  const input = toolCall.input;

  try {
    switch (action) {
      case 'spawn_task': {
        const task = input.task as string;
        if (!task) return { success: false, output: 'Missing task parameter' };

        // Clamp timeout: min 10s, max 600s (10 min), default 120s
        let timeoutSeconds = (input.timeout_seconds as number) || 120;
        timeoutSeconds = Math.max(10, Math.min(600, timeoutSeconds));
        const timeoutMs = timeoutSeconds * 1000;

        console.log(`[agent-tools] Spawning background task for ${agentId}: "${task.slice(0, 80)}..." (timeout: ${timeoutSeconds}s)`);

        const result = await spawnTask(agentId, task, { timeout: timeoutMs });

        if (result.status === 'completed') {
          return {
            success: true,
            output: `Background task completed (run #${result.runId}):\n\n${result.reply || '(empty response)'}`,
          };
        } else {
          return {
            success: false,
            output: `Background task failed (run #${result.runId}): ${result.error || 'Unknown error'}`,
          };
        }
      }

      default:
        return { success: false, output: `Unknown agent action: ${action}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: `Agent tool error: ${msg}` };
  }
}
