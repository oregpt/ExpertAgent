/**
 * Cron Tools
 *
 * Tools that let the LLM create/list/delete its own cron jobs.
 * Wires into the existing cronService.ts backend.
 *
 * Tools:
 *   cron__schedule(schedule, task_text)  — create a new cron job
 *   cron__list()                         — list all cron jobs for this agent
 *   cron__update(job_id, patch)          — update an existing cron job
 *   cron__delete(job_id)                 — delete a cron job
 */

import { Tool, ToolCall } from '../llm/types';
import {
  createJob,
  listJobs,
  updateJob,
  deleteJob,
  getJob,
} from '../proactive/cronService';

// ============================================================================
// Tool Definitions
// ============================================================================

export const CRON_TOOLS: Tool[] = [
  {
    name: 'cron__schedule',
    description:
      '[cron] Create a scheduled job. Supports cron syntax (e.g. "0 9 * * *" for daily 9am) or intervals ("every 30m", "every 1h", "every 24h"). The task_text is what you will be asked to do when the job fires.',
    inputSchema: {
      type: 'object',
      properties: {
        schedule: {
          type: 'string',
          description: 'Cron expression or interval (e.g. "0 9 * * 1-5", "every 2h")',
        },
        task_text: {
          type: 'string',
          description: 'The task/prompt to execute when the job fires',
        },
        enabled: {
          type: 'boolean',
          description: 'Whether the job starts enabled (default: true)',
        },
      },
      required: ['schedule', 'task_text'],
    },
  },
  {
    name: 'cron__list',
    description:
      '[cron] List all scheduled cron jobs for this agent. Shows schedule, task, status, and next run time.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'cron__update',
    description:
      '[cron] Update an existing cron job. Can change schedule, task text, or enable/disable.',
    inputSchema: {
      type: 'object',
      properties: {
        job_id: {
          type: 'number',
          description: 'The ID of the cron job to update',
        },
        schedule: {
          type: 'string',
          description: 'New cron expression or interval',
        },
        task_text: {
          type: 'string',
          description: 'New task text',
        },
        enabled: {
          type: 'boolean',
          description: 'Enable or disable the job',
        },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'cron__delete',
    description: '[cron] Delete a scheduled cron job by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        job_id: {
          type: 'number',
          description: 'The ID of the cron job to delete',
        },
      },
      required: ['job_id'],
    },
  },
];

// ============================================================================
// Tool Detection & Execution
// ============================================================================

const CRON_TOOL_NAMES = new Set(CRON_TOOLS.map((t) => t.name));

export function isCronTool(toolName: string): boolean {
  return CRON_TOOL_NAMES.has(toolName);
}

export async function executeCronTool(
  agentId: string,
  toolCall: ToolCall
): Promise<{ success: boolean; output: string }> {
  const action = toolCall.name.replace('cron__', '');
  const input = toolCall.input;

  try {
    switch (action) {
      case 'schedule': {
        const schedule = input.schedule as string;
        const taskText = input.task_text as string;
        if (!schedule) return { success: false, output: 'Missing schedule parameter' };
        if (!taskText) return { success: false, output: 'Missing task_text parameter' };

        const enabled = input.enabled !== false; // default true
        const job = await createJob({
          agentId,
          schedule,
          taskText,
          enabled,
        });

        return {
          success: true,
          output: `Cron job created (ID: ${job.id}).\nSchedule: ${job.schedule}\nTask: ${job.taskText}\nEnabled: ${job.enabled}\nNext run: ${job.nextRunAt?.toISOString() || 'calculating...'}`,
        };
      }

      case 'list': {
        const jobs = await listJobs(agentId);
        if (jobs.length === 0) {
          return { success: true, output: 'No cron jobs configured.' };
        }

        const formatted = jobs
          .map(
            (j) =>
              `[ID: ${j.id}] ${j.enabled ? '✅' : '⏸️'} "${j.taskText.slice(0, 80)}${j.taskText.length > 80 ? '...' : ''}"\n  Schedule: ${j.schedule} | Next: ${j.nextRunAt?.toISOString() || 'N/A'} | Last: ${j.lastRunAt?.toISOString() || 'never'}`
          )
          .join('\n\n');
        return { success: true, output: `${jobs.length} cron job(s):\n\n${formatted}` };
      }

      case 'update': {
        const jobId = input.job_id as number;
        if (!jobId) return { success: false, output: 'Missing job_id parameter' };

        const patch: any = {};
        if (input.schedule !== undefined) patch.schedule = input.schedule as string;
        if (input.task_text !== undefined) patch.taskText = input.task_text as string;
        if (input.enabled !== undefined) patch.enabled = input.enabled as boolean;

        if (Object.keys(patch).length === 0) {
          return { success: false, output: 'No fields to update. Provide schedule, task_text, or enabled.' };
        }

        const updated = await updateJob(jobId, agentId, patch);
        if (!updated) {
          return { success: false, output: `Cron job ${jobId} not found or not owned by this agent.` };
        }

        return {
          success: true,
          output: `Cron job ${jobId} updated.\nSchedule: ${updated.schedule}\nTask: ${updated.taskText.slice(0, 80)}\nEnabled: ${updated.enabled}\nNext run: ${updated.nextRunAt?.toISOString() || 'N/A'}`,
        };
      }

      case 'delete': {
        const jobId = input.job_id as number;
        if (!jobId) return { success: false, output: 'Missing job_id parameter' };

        const deleted = await deleteJob(jobId, agentId);
        if (!deleted) {
          return { success: false, output: `Cron job ${jobId} not found or not owned by this agent.` };
        }

        return { success: true, output: `Cron job ${jobId} deleted.` };
      }

      default:
        return { success: false, output: `Unknown cron action: ${action}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: `Cron tool error: ${msg}` };
  }
}
