/**
 * Background Agent
 *
 * Spawns fire-and-forget agent tasks that run in isolation.
 * Each task creates its own conversation, executes via chat service,
 * and logs the result to the task runs audit table.
 *
 * Gated by the `backgroundAgents` feature flag.
 */

import { db } from '../db/client';
import { agentTaskRuns } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateReply, startConversation, appendMessage } from '../chat/chatService';
import { getFeatures } from '../licensing/features';
import { dbNow } from '../db/date-utils';

// ============================================================================
// Types
// ============================================================================

export interface SpawnTaskOptions {
  model?: string;
  timeout?: number; // ms, default 120000 (2 min)
}

export interface TaskResult {
  runId: number;
  status: 'completed' | 'failed';
  reply?: string;
  error?: string;
}

// ============================================================================
// Spawn Task
// ============================================================================

/**
 * Spawn an isolated background task for an agent.
 *
 * Creates a task run record, executes the task via chat service
 * in a new conversation, and returns the result.
 *
 * This is synchronous (awaits completion) but runs in its own conversation
 * context, isolated from the user's chat history.
 */
export async function spawnTask(
  agentId: string,
  taskText: string,
  options?: SpawnTaskOptions
): Promise<TaskResult> {
  const features = getFeatures();
  if (!features.backgroundAgents) {
    throw new Error('Background agents feature is not enabled');
  }

  console.log(`[background] Spawning task for agent ${agentId}: "${taskText.slice(0, 80)}..."`);

  // Create task run audit record
  const runRows = await db
    .insert(agentTaskRuns)
    .values({
      agentId,
      runType: 'background',
      taskText,
      status: 'running',
    })
    .returning() as any[];
  const runId = runRows[0].id as number;

  try {
    // Create isolated conversation
    const conv = await startConversation(agentId, '__background__', 'Background Task');
    await appendMessage(conv.id as number, 'user', taskText);

    // Execute with optional timeout
    const timeoutMs = options?.timeout ?? 120000;
    const result = await Promise.race([
      generateReply(conv.id as number, taskText),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Task timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);

    // Update task run as completed
    await db
      .update(agentTaskRuns)
      .set({
        status: 'completed',
        result: result.reply,
        completedAt: dbNow(),
      } as any)
      .where(eq(agentTaskRuns.id, runId));

    console.log(`[background] Task ${runId} completed. Reply length: ${result.reply.length}`);

    return {
      runId,
      status: 'completed',
      reply: result.reply,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[background] Task ${runId} failed:`, error);

    // Update task run as failed
    await db
      .update(agentTaskRuns)
      .set({
        status: 'failed',
        error,
        completedAt: dbNow(),
      } as any)
      .where(eq(agentTaskRuns.id, runId));

    return {
      runId,
      status: 'failed',
      error,
    };
  }
}
