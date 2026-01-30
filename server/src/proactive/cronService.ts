/**
 * Cron Service
 *
 * CRUD operations for agent cron jobs, schedule parsing, and execution.
 * Supports standard 5-field cron expressions (common patterns) and
 * simple interval syntax ('every 30m', 'every 1h', 'every 24h').
 *
 * No external cron libraries — lightweight pattern matching only.
 */

import { db } from '../db/client';
import { agentCronJobs, agentTaskRuns } from '../db/schema';
import { eq, and, lte, sql } from 'drizzle-orm';
import { generateReply, startConversation, appendMessage } from '../chat/chatService';
import { getFeatures } from '../licensing/features';

// ============================================================================
// Types
// ============================================================================

export interface CronJob {
  id: number;
  agentId: string;
  schedule: string;
  taskText: string;
  model: string | null;
  enabled: boolean | null;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCronJobInput {
  agentId: string;
  schedule: string;
  taskText: string;
  model?: string;
  enabled?: boolean;
}

export interface UpdateCronJobInput {
  schedule?: string;
  taskText?: string;
  model?: string | null;
  enabled?: boolean;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new cron job for an agent
 */
export async function createJob(input: CreateCronJobInput): Promise<CronJob> {
  // Validate schedule before creating
  const nextRun = calculateNextRun(input.schedule);
  if (!nextRun) {
    throw new Error(`Invalid schedule expression: '${input.schedule}'. Use cron format (e.g., '0 9 * * *') or interval (e.g., 'every 30m')`);
  }

  const rows = await db
    .insert(agentCronJobs)
    .values({
      agentId: input.agentId,
      schedule: input.schedule,
      taskText: input.taskText,
      model: input.model || null,
      enabled: input.enabled !== false,
      nextRunAt: nextRun,
    })
    .returning() as any[];

  return rows[0] as CronJob;
}

/**
 * Update an existing cron job
 */
export async function updateJob(jobId: number, agentId: string, input: UpdateCronJobInput): Promise<CronJob | null> {
  // If schedule is being changed, validate and recalculate next run
  let nextRunAt: Date | undefined;
  if (input.schedule) {
    const nextRun = calculateNextRun(input.schedule);
    if (!nextRun) {
      throw new Error(`Invalid schedule expression: '${input.schedule}'`);
    }
    nextRunAt = nextRun;
  }

  const updateData: any = { updatedAt: new Date() };
  if (input.schedule !== undefined) updateData.schedule = input.schedule;
  if (input.taskText !== undefined) updateData.taskText = input.taskText;
  if (input.model !== undefined) updateData.model = input.model;
  if (input.enabled !== undefined) updateData.enabled = input.enabled;
  if (nextRunAt) updateData.nextRunAt = nextRunAt;

  const rows = await db
    .update(agentCronJobs)
    .set(updateData)
    .where(and(eq(agentCronJobs.id, jobId), eq(agentCronJobs.agentId, agentId)))
    .returning() as any[];

  return rows.length > 0 ? (rows[0] as CronJob) : null;
}

/**
 * Delete a cron job
 */
export async function deleteJob(jobId: number, agentId: string): Promise<boolean> {
  const rows = await db
    .delete(agentCronJobs)
    .where(and(eq(agentCronJobs.id, jobId), eq(agentCronJobs.agentId, agentId)))
    .returning() as any[];

  return rows.length > 0;
}

/**
 * List all cron jobs for an agent
 */
export async function listJobs(agentId: string): Promise<CronJob[]> {
  const rows = await db
    .select()
    .from(agentCronJobs)
    .where(eq(agentCronJobs.agentId, agentId))
    .orderBy(agentCronJobs.createdAt) as any[];

  return rows as CronJob[];
}

/**
 * Get a single cron job
 */
export async function getJob(jobId: number, agentId: string): Promise<CronJob | null> {
  const rows = await db
    .select()
    .from(agentCronJobs)
    .where(and(eq(agentCronJobs.id, jobId), eq(agentCronJobs.agentId, agentId)))
    .limit(1) as any[];

  return rows.length > 0 ? (rows[0] as CronJob) : null;
}

// ============================================================================
// Execution
// ============================================================================

/**
 * Find all enabled jobs whose next_run_at has passed
 */
export async function getDueJobs(): Promise<CronJob[]> {
  const now = new Date();
  const rows = await db
    .select()
    .from(agentCronJobs)
    .where(
      and(
        eq(agentCronJobs.enabled, true),
        lte(agentCronJobs.nextRunAt, now)
      )
    ) as any[];

  return rows as CronJob[];
}

/**
 * Execute a cron job: send task_text to chat service, log result, update timestamps
 */
export async function executeJob(job: CronJob): Promise<void> {
  console.log(`[cron] Executing job ${job.id} for agent ${job.agentId}: "${job.taskText.slice(0, 80)}..."`);

  // Create task run audit record
  const runRows = await db
    .insert(agentTaskRuns)
    .values({
      agentId: job.agentId,
      runType: 'cron',
      sourceId: job.id,
      taskText: job.taskText,
      status: 'running',
    })
    .returning() as any[];
  const runId = runRows[0].id as number;

  try {
    // Create an isolated conversation for this cron execution
    const conv = await startConversation(job.agentId, '__cron__', `Cron Job #${job.id}`);
    await appendMessage(conv.id as number, 'user', job.taskText);

    // Execute via chat service (same path as a user message)
    const result = await generateReply(conv.id as number, job.taskText);

    // Update task run as completed
    await db
      .update(agentTaskRuns)
      .set({
        status: 'completed',
        result: result.reply,
        completedAt: new Date(),
      })
      .where(eq(agentTaskRuns.id, runId));

    // Update cron job timestamps
    const nextRun = calculateNextRun(job.schedule);
    await db
      .update(agentCronJobs)
      .set({
        lastRunAt: new Date(),
        nextRunAt: nextRun,
        updatedAt: new Date(),
      })
      .where(eq(agentCronJobs.id, job.id));

    // v2: Broadcast cron results to all enabled channels (if not heartbeat-like)
    const trimmedReply = result.reply.trim();
    if (trimmedReply !== 'HEARTBEAT_OK' && getFeatures().multiChannel) {
      try {
        const { channelRouter } = await import('../channels/channelRouter');
        await channelRouter.sendToAllChannels(job.agentId, result.reply);
        console.log(`[cron] Broadcast cron result to channels for job ${job.id}`);
      } catch (channelErr) {
        console.warn(`[cron] Channel broadcast failed for job ${job.id}:`, channelErr);
      }
    }

    console.log(`[cron] Job ${job.id} completed. Reply length: ${result.reply.length}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[cron] Job ${job.id} failed:`, error);

    // Update task run as failed
    await db
      .update(agentTaskRuns)
      .set({
        status: 'failed',
        error,
        completedAt: new Date(),
      })
      .where(eq(agentTaskRuns.id, runId));

    // Still advance next_run_at so we don't retry failed jobs in a tight loop
    const nextRun = calculateNextRun(job.schedule);
    await db
      .update(agentCronJobs)
      .set({
        lastRunAt: new Date(),
        nextRunAt: nextRun,
        updatedAt: new Date(),
      })
      .where(eq(agentCronJobs.id, job.id));
  }
}

// ============================================================================
// Schedule Parsing
// ============================================================================

/**
 * Calculate the next run time from a schedule expression.
 *
 * Supports:
 * - Simple intervals: 'every 30m', 'every 1h', 'every 24h', 'every 2d'
 * - Standard 5-field cron: '0 * * * *' (hourly), '0 9 * * *' (daily 9am),
 *   '0 9 * * 1' (weekly Mon 9am), 'x/N * * * *' (every N min)
 *
 * Returns null if the expression is not recognized.
 */
export function calculateNextRun(schedule: string, fromDate?: Date): Date | null {
  const now = fromDate || new Date();

  // Try interval format first: 'every Nm', 'every Nh', 'every Nd'
  const intervalMatch = schedule.match(/^every\s+(\d+)\s*(m|min|minutes?|h|hours?|d|days?)$/i);
  if (intervalMatch) {
    const value = parseInt(intervalMatch[1]!, 10);
    const unit = intervalMatch[2]!.toLowerCase();

    let ms: number;
    if (unit.startsWith('m')) {
      ms = value * 60 * 1000;
    } else if (unit.startsWith('h')) {
      ms = value * 60 * 60 * 1000;
    } else if (unit.startsWith('d')) {
      ms = value * 24 * 60 * 60 * 1000;
    } else {
      return null;
    }

    if (ms < 60000) return null; // Minimum 1 minute
    return new Date(now.getTime() + ms);
  }

  // Try 5-field cron expression: minute hour dayOfMonth month dayOfWeek
  const cronParts = schedule.trim().split(/\s+/);
  if (cronParts.length === 5) {
    return calculateNextCronRun(cronParts, now);
  }

  return null;
}

/**
 * Parse a 5-field cron expression and find the next matching time.
 *
 * Supports:
 * - Exact values: '0', '9', '1'
 * - Wildcards: '*'
 * - Step values: 'x/N' (e.g., star/30 = every 30 units)
 *
 * Walks forward from `now` minute-by-minute (up to 8 days) to find the next match.
 * This is intentionally simple - no full cron library needed for common patterns.
 */
function calculateNextCronRun(parts: string[], now: Date): Date | null {
  const minExpr = parts[0] ?? '*';
  const hourExpr = parts[1] ?? '*';
  const domExpr = parts[2] ?? '*';
  const monExpr = parts[3] ?? '*';
  const dowExpr = parts[4] ?? '*';

  // Start from the next minute
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  // Walk forward up to 8 days (enough to find any weekly pattern)
  const maxIterations = 8 * 24 * 60; // 8 days in minutes
  for (let i = 0; i < maxIterations; i++) {
    const min = candidate.getMinutes();
    const hour = candidate.getHours();
    const dom = candidate.getDate();
    const mon = candidate.getMonth() + 1; // 1-12
    const dow = candidate.getDay();        // 0=Sun, 1=Mon, ...6=Sat

    if (
      matchesCronField(min, minExpr, 0, 59) &&
      matchesCronField(hour, hourExpr, 0, 23) &&
      matchesCronField(dom, domExpr, 1, 31) &&
      matchesCronField(mon, monExpr, 1, 12) &&
      matchesCronField(dow, dowExpr, 0, 6)
    ) {
      return candidate;
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return null; // No match found in 8 days — probably an invalid expression
}

/**
 * Check if a value matches a single cron field expression.
 *
 * Supports: '*', exact number, step 'x/N', comma-separated values, ranges 'A-B'
 */
function matchesCronField(value: number, expr: string, _min: number, _max: number): boolean {
  // Wildcard
  if (expr === '*') return true;

  // Comma-separated list: '1,3,5'
  if (expr.includes(',')) {
    return expr.split(',').some((part) => matchesCronField(value, part.trim(), _min, _max));
  }

  // Step: '*/N' or 'V/N'
  if (expr.includes('/')) {
    const splitParts = expr.split('/');
    const base = splitParts[0] ?? '*';
    const stepStr = splitParts[1] ?? '1';
    const step = parseInt(stepStr, 10);
    if (isNaN(step) || step <= 0) return false;

    const start = base === '*' ? _min : parseInt(base, 10);
    if (isNaN(start)) return false;

    // Check if value is reachable from start by stepping
    return (value - start) >= 0 && (value - start) % step === 0;
  }

  // Range: 'A-B'
  if (expr.includes('-')) {
    const rangeParts = expr.split('-');
    const start = parseInt(rangeParts[0] ?? '', 10);
    const end = parseInt(rangeParts[1] ?? '', 10);
    if (isNaN(start) || isNaN(end)) return false;
    return value >= start && value <= end;
  }

  // Exact value
  const exact = parseInt(expr, 10);
  if (isNaN(exact)) return false;
  return value === exact;
}
