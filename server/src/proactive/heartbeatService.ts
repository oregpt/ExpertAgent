/**
 * Heartbeat Service
 *
 * Manages per-agent heartbeat configuration and execution.
 * Heartbeats are periodic check-ins where the agent reviews a checklist
 * and decides if anything needs attention.
 */

import { db } from '../db/client';
import { agentHeartbeatConfig, agentTaskRuns } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateReply, startConversation, appendMessage } from '../chat/chatService';
import { getFeatures } from '../licensing/features';
import { getAgentFeatures } from '../licensing/agentFeatures';

// ============================================================================
// Types
// ============================================================================

export interface HeartbeatConfig {
  agentId: string;
  enabled: boolean | null;
  intervalMinutes: number | null;
  checklist: string | null;
  quietHoursStart: string | null;  // TIME as string, e.g. '23:00:00'
  quietHoursEnd: string | null;
  timezone: string | null;
  lastHeartbeatAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertHeartbeatInput {
  enabled?: boolean;
  intervalMinutes?: number;
  checklist?: string;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  timezone?: string;
}

// ============================================================================
// Config CRUD
// ============================================================================

/**
 * Get heartbeat config for an agent. Returns null if not configured.
 */
export async function getConfig(agentId: string): Promise<HeartbeatConfig | null> {
  const rows = await db
    .select()
    .from(agentHeartbeatConfig)
    .where(eq(agentHeartbeatConfig.agentId, agentId))
    .limit(1) as any[];

  return rows.length > 0 ? (rows[0] as HeartbeatConfig) : null;
}

/**
 * Create or update heartbeat config for an agent.
 */
export async function upsertConfig(agentId: string, input: UpsertHeartbeatInput): Promise<HeartbeatConfig> {
  const existing = await getConfig(agentId);

  if (existing) {
    // Update existing config
    const updateData: any = { updatedAt: new Date() };
    if (input.enabled !== undefined) updateData.enabled = input.enabled;
    if (input.intervalMinutes !== undefined) updateData.intervalMinutes = input.intervalMinutes;
    if (input.checklist !== undefined) updateData.checklist = input.checklist;
    if (input.quietHoursStart !== undefined) updateData.quietHoursStart = input.quietHoursStart;
    if (input.quietHoursEnd !== undefined) updateData.quietHoursEnd = input.quietHoursEnd;
    if (input.timezone !== undefined) updateData.timezone = input.timezone;

    const rows = await db
      .update(agentHeartbeatConfig)
      .set(updateData)
      .where(eq(agentHeartbeatConfig.agentId, agentId))
      .returning() as any[];

    return rows[0] as HeartbeatConfig;
  } else {
    // Insert new config
    const rows = await db
      .insert(agentHeartbeatConfig)
      .values({
        agentId,
        enabled: input.enabled ?? false,
        intervalMinutes: input.intervalMinutes ?? 30,
        checklist: input.checklist ?? null,
        quietHoursStart: input.quietHoursStart ?? null,
        quietHoursEnd: input.quietHoursEnd ?? null,
        timezone: input.timezone ?? 'UTC',
      })
      .returning() as any[];

    return rows[0] as HeartbeatConfig;
  }
}

// ============================================================================
// Due Check
// ============================================================================

/**
 * Check if a heartbeat is due for execution.
 * Returns true if:
 * 1. Heartbeat is enabled
 * 2. Enough time has elapsed since last heartbeat
 * 3. Current time is NOT within quiet hours
 */
export function isDue(config: HeartbeatConfig): boolean {
  if (!config.enabled) return false;

  const now = new Date();
  const intervalMs = (config.intervalMinutes ?? 30) * 60 * 1000;

  // Check if enough time has elapsed
  if (config.lastHeartbeatAt) {
    const elapsed = now.getTime() - new Date(config.lastHeartbeatAt).getTime();
    if (elapsed < intervalMs) return false;
  }

  // Check quiet hours
  if (config.quietHoursStart && config.quietHoursEnd) {
    if (isInQuietHours(now, config.quietHoursStart, config.quietHoursEnd, config.timezone ?? 'UTC')) {
      return false;
    }
  }

  return true;
}

/**
 * Check if the current time falls within quiet hours.
 *
 * Handles overnight quiet hours (e.g., 23:00 → 08:00).
 * Uses simple UTC-offset approximation for timezone support.
 */
function isInQuietHours(now: Date, startStr: string, endStr: string, _timezone: string): boolean {
  // Parse TIME strings (e.g., '23:00' or '23:00:00')
  const startParts = startStr.split(':').map(Number);
  const endParts = endStr.split(':').map(Number);

  if (startParts.length < 2 || endParts.length < 2) return false;

  const startMinutes = (startParts[0] ?? 0) * 60 + (startParts[1] ?? 0);
  const endMinutes = (endParts[0] ?? 0) * 60 + (endParts[1] ?? 0);

  // Get current time in minutes (UTC — timezone support is best-effort)
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  if (startMinutes <= endMinutes) {
    // Same-day quiet hours: e.g., 09:00 → 17:00
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  } else {
    // Overnight quiet hours: e.g., 23:00 → 08:00
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }
}

// ============================================================================
// Execution
// ============================================================================

/**
 * Get all enabled heartbeat configs (for the polling loop)
 */
export async function getAllEnabledConfigs(): Promise<HeartbeatConfig[]> {
  const rows = await db
    .select()
    .from(agentHeartbeatConfig)
    .where(eq(agentHeartbeatConfig.enabled, true)) as any[];

  return rows as HeartbeatConfig[];
}

/**
 * Execute a heartbeat for an agent.
 * Builds the heartbeat prompt from the checklist, sends to chat service, logs the result.
 */
export async function executeHeartbeat(agentId: string): Promise<void> {
  // Per-agent feature check: skip if proactive is disabled for this agent
  const agentFeatures = await getAgentFeatures(agentId);
  if (!agentFeatures.proactive) {
    console.log(`[heartbeat] Skipping agent ${agentId} — proactive disabled per-agent`);
    return;
  }

  const config = await getConfig(agentId);
  if (!config) {
    console.warn(`[heartbeat] No config found for agent ${agentId}`);
    return;
  }

  console.log(`[heartbeat] Executing heartbeat for agent ${agentId}`);

  // Build heartbeat prompt
  const checklist = config.checklist || 'No specific checklist configured. Check if anything needs attention.';
  const prompt = `You are performing a periodic check. Review your checklist:\n\n${checklist}\n\nIf nothing needs attention, respond with HEARTBEAT_OK.`;

  // Create task run audit record
  const runRows = await db
    .insert(agentTaskRuns)
    .values({
      agentId,
      runType: 'heartbeat',
      taskText: prompt,
      status: 'running',
    })
    .returning() as any[];
  const runId = runRows[0].id as number;

  try {
    // Create an isolated conversation for this heartbeat
    const conv = await startConversation(agentId, '__heartbeat__', 'Heartbeat');
    await appendMessage(conv.id as number, 'user', prompt);

    // Execute via chat service
    const result = await generateReply(conv.id as number, prompt);

    // Update task run as completed
    await db
      .update(agentTaskRuns)
      .set({
        status: 'completed',
        result: result.reply,
        completedAt: new Date(),
      })
      .where(eq(agentTaskRuns.id, runId));

    // Update last heartbeat timestamp
    await db
      .update(agentHeartbeatConfig)
      .set({
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentHeartbeatConfig.agentId, agentId));

    // v2: If the result is NOT "HEARTBEAT_OK", broadcast to all enabled channels
    const trimmedReply = result.reply.trim();
    if (trimmedReply !== 'HEARTBEAT_OK' && agentFeatures.multiChannel) {
      try {
        const { channelRouter } = await import('../channels/channelRouter');
        await channelRouter.sendToAllChannels(agentId, result.reply);
        console.log(`[heartbeat] Broadcast heartbeat result to channels for agent ${agentId}`);
      } catch (channelErr) {
        console.warn(`[heartbeat] Channel broadcast failed for agent ${agentId}:`, channelErr);
      }
    }

    console.log(`[heartbeat] Agent ${agentId} heartbeat done. Response: "${result.reply.slice(0, 100)}..."`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[heartbeat] Agent ${agentId} heartbeat failed:`, error);

    // Update task run as failed
    await db
      .update(agentTaskRuns)
      .set({
        status: 'failed',
        error,
        completedAt: new Date(),
      })
      .where(eq(agentTaskRuns.id, runId));

    // Still update last heartbeat time to avoid retry storm
    await db
      .update(agentHeartbeatConfig)
      .set({
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentHeartbeatConfig.agentId, agentId));
  }
}
