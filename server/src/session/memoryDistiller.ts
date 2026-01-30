/**
 * Memory Distiller
 *
 * Periodic review process that reads recent daily logs and the current
 * long-term memory (memory.md), then uses the LLM to extract important
 * learnings, patterns, and facts worth remembering.
 *
 * This is NOT auto-scheduled. The admin can create a cron job that
 * calls distillMemory(agentId) on their preferred schedule.
 *
 * Flow:
 * 1. Read last 3 days of daily logs (daily/YYYY-MM-DD.md)
 * 2. Read current memory.md
 * 3. Send to LLM with distillation prompt
 * 4. Write updated memory.md back
 * 5. Re-embed memory.md for semantic search
 */

import { db } from '../db/client';
import { agents } from '../db/schema';
import { eq } from 'drizzle-orm';
import { getDocument, upsertDocument } from '../memory/documentService';
import { embedDocument } from '../memory/memoryEmbedder';
import { getProviderForModel } from '../llm';
import { getFeatures } from '../licensing/features';

// ============================================================================
// Types
// ============================================================================

export interface DistillationResult {
  success: boolean;
  agentId: string;
  dailyLogsFound: number;
  memoryUpdated: boolean;
  error?: string;
}

// ============================================================================
// Main Distillation Function
// ============================================================================

/**
 * Distill recent daily logs into long-term memory for an agent.
 *
 * Call this from a cron job or manually via an admin endpoint.
 * Requires soulMemory feature flag to be enabled.
 */
export async function distillMemory(agentId: string): Promise<DistillationResult> {
  const features = getFeatures();
  if (!features.soulMemory) {
    return {
      success: false,
      agentId,
      dailyLogsFound: 0,
      memoryUpdated: false,
      error: 'soulMemory feature is disabled',
    };
  }

  console.log(`[distiller] Starting memory distillation for agent ${agentId}`);

  try {
    // 1. Read the last 3 days of daily logs
    const dailyLogs = await readRecentDailyLogs(agentId, 3);
    if (dailyLogs.length === 0) {
      console.log(`[distiller] No daily logs found for agent ${agentId} — skipping`);
      return {
        success: true,
        agentId,
        dailyLogsFound: 0,
        memoryUpdated: false,
      };
    }

    // 2. Read current memory.md
    const memoryDoc = await getDocument(agentId, 'memory.md');
    const currentMemory = memoryDoc?.content || '# Agent Memory\n\n_No long-term memories yet._';

    // 3. Build the daily log content
    let dailyLogContent = '';
    for (const log of dailyLogs) {
      dailyLogContent += `--- ${log.docKey} ---\n${log.content}\n\n`;
    }

    // 4. Call LLM with distillation prompt
    const updatedMemory = await callLLMForDistillation(agentId, currentMemory, dailyLogContent);

    if (!updatedMemory) {
      console.warn(`[distiller] LLM returned empty result for agent ${agentId}`);
      return {
        success: false,
        agentId,
        dailyLogsFound: dailyLogs.length,
        memoryUpdated: false,
        error: 'LLM returned empty distillation result',
      };
    }

    // 5. Write updated memory.md
    const doc = await upsertDocument(agentId, 'memory', 'memory.md', updatedMemory);

    // 6. Re-embed memory.md (upsertDocument already triggers this, but let's be explicit)
    // The upsertDocument call above fires embedDocument in the background.
    // We'll also explicitly await it for the distillation case since it's a background task.
    try {
      await embedDocument(agentId, doc.id, updatedMemory);
      console.log(`[distiller] Re-embedded memory.md for agent ${agentId}`);
    } catch (embedErr) {
      console.warn(`[distiller] Re-embedding failed (non-fatal):`, embedErr);
    }

    console.log(`[distiller] Memory distillation complete for agent ${agentId} — ${dailyLogs.length} daily logs processed`);

    return {
      success: true,
      agentId,
      dailyLogsFound: dailyLogs.length,
      memoryUpdated: true,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[distiller] Memory distillation failed for agent ${agentId}:`, error);
    return {
      success: false,
      agentId,
      dailyLogsFound: 0,
      memoryUpdated: false,
      error,
    };
  }
}

// ============================================================================
// Daily Log Reader
// ============================================================================

/**
 * Read the last N days of daily logs for an agent.
 * Daily logs use the key format: `daily/YYYY-MM-DD.md`
 */
async function readRecentDailyLogs(
  agentId: string,
  days: number
): Promise<Array<{ docKey: string; content: string }>> {
  const logs: Array<{ docKey: string; content: string }> = [];

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const docKey = `daily/${dateStr}.md`;

    const doc = await getDocument(agentId, docKey);
    if (doc && doc.content.trim()) {
      logs.push({ docKey, content: doc.content });
    }
  }

  return logs;
}

// ============================================================================
// LLM Distillation Call
// ============================================================================

const DISTILLATION_PROMPT = `You are a memory curator for an AI agent. Your job is to review recent daily conversation logs and update the agent's long-term memory.

CURRENT LONG-TERM MEMORY:
{CURRENT_MEMORY}

RECENT DAILY LOGS (last 3 days):
{DAILY_LOGS}

INSTRUCTIONS:
1. Review the daily logs for important learnings, patterns, facts, and user preferences.
2. Compare with the current long-term memory.
3. Add new insights that are worth remembering long-term.
4. Remove or update any outdated information.
5. Keep the memory concise and well-organized with markdown headers.
6. Focus on: user preferences, recurring topics, important decisions, learned facts, behavioral patterns.
7. Do NOT include raw conversation logs — distill them into insights.

Return ONLY the updated memory.md content (no explanation, no preamble). Start with "# Agent Memory".`;

/**
 * Call the LLM to distill daily logs into updated memory.
 */
async function callLLMForDistillation(
  agentId: string,
  currentMemory: string,
  dailyLogContent: string
): Promise<string | null> {
  // Get agent's model
  const agentRows = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1) as any[];

  const model = (agentRows[0]?.defaultModel as string) ||
    process.env.DEFAULT_MODEL || 'claude-sonnet-4-20250514';

  const prompt = DISTILLATION_PROMPT
    .replace('{CURRENT_MEMORY}', currentMemory)
    .replace('{DAILY_LOGS}', dailyLogContent);

  try {
    const provider = getProviderForModel(model);
    const result = await provider.generate(
      [
        { role: 'system', content: 'You are a precise memory curator. Return only the updated memory content.' },
        { role: 'user', content: prompt },
      ],
      { model, maxTokens: 2000, agentId }
    );

    return result?.trim() || null;
  } catch (err) {
    console.error(`[distiller] LLM call failed:`, err);
    return null;
  }
}

// ============================================================================
// Proactive Task Helper
// ============================================================================

/**
 * Helper function that the proactive engine can invoke for memory distillation.
 * Can be used as a cron job task or called from the admin API.
 *
 * Usage in a cron job task_text:
 *   The admin creates a cron job. The proactive engine runs it through
 *   chatService, and the agent can call the memory distillation tool.
 *
 * Or, call directly:
 *   import { runDistillation } from './memoryDistiller';
 *   await runDistillation(agentId);
 */
export async function runDistillation(agentId: string): Promise<string> {
  const result = await distillMemory(agentId);
  if (result.success) {
    return `Memory distillation complete. Processed ${result.dailyLogsFound} daily logs. Memory ${result.memoryUpdated ? 'updated' : 'unchanged'}.`;
  } else {
    return `Memory distillation failed: ${result.error}`;
  }
}
