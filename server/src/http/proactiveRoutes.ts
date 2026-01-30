/**
 * Proactive Routes
 *
 * REST API for heartbeat config, cron job management, manual triggers,
 * and task run history.
 *
 * All routes gated by the `proactive` feature flag (403 if disabled).
 */

import { Router } from 'express';
import { getFeatures } from '../licensing/features';
import { getAgentFeatures } from '../licensing/agentFeatures';
import {
  getHeartbeatConfig,
  upsertHeartbeatConfig,
  createJob,
  updateJob,
  deleteJob,
  listJobs,
  getJob,
  executeJob,
} from '../proactive';
import { db } from '../db/client';
import { agentTaskRuns } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { validate, cronJobCreateSchema, heartbeatConfigSchema } from '../middleware/validation';

export const proactiveRouter = Router();

// ============================================================================
// Middleware: require proactive feature flag
// ============================================================================

function requireProactive(_req: any, res: any, next: any): void {
  const features = getFeatures();
  if (!features.proactive) {
    res.status(403).json({
      error: 'Proactive engine feature not enabled',
      code: 'PROACTIVE_NOT_LICENSED',
      message: 'Enable the proactive feature flag or upgrade your license to use this endpoint.',
    });
    return;
  }
  next();
}

/**
 * Middleware: check per-agent proactive feature flag
 * Applied to routes that have :id param for the agent
 */
async function requireProactiveForAgent(req: any, res: any, next: any): Promise<void> {
  const agentId = req.params.id;
  if (!agentId) {
    return next();
  }
  const features = await getAgentFeatures(agentId);
  if (!features.proactive) {
    res.status(403).json({
      error: 'Proactive engine disabled for this agent',
      code: 'PROACTIVE_DISABLED_FOR_AGENT',
      message: 'This feature is disabled for this agent. Enable it in the agent configuration.',
    });
    return;
  }
  next();
}

// Apply auth + global feature guard to all routes
proactiveRouter.use(requireAuth);
proactiveRouter.use(requireProactive);

// ============================================================================
// Heartbeat Config
// ============================================================================

/**
 * GET /api/agents/:id/heartbeat
 * Get heartbeat config for an agent
 */
proactiveRouter.get('/agents/:id/heartbeat', requireProactiveForAgent, async (req, res) => {
  try {
    const agentId = req.params.id;
    const config = await getHeartbeatConfig(agentId);

    if (!config) {
      // Return default (unconfigured) state
      return res.json({
        agentId,
        enabled: false,
        intervalMinutes: 30,
        checklist: null,
        quietHoursStart: null,
        quietHoursEnd: null,
        timezone: 'UTC',
        lastHeartbeatAt: null,
      });
    }

    res.json({
      agentId: config.agentId,
      enabled: config.enabled,
      intervalMinutes: config.intervalMinutes,
      checklist: config.checklist,
      quietHoursStart: config.quietHoursStart,
      quietHoursEnd: config.quietHoursEnd,
      timezone: config.timezone,
      lastHeartbeatAt: config.lastHeartbeatAt,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    });
  } catch (err) {
    console.error('[proactive-routes] Get heartbeat config error:', err);
    res.status(500).json({ error: 'Failed to get heartbeat config' });
  }
});

/**
 * PUT /api/agents/:id/heartbeat
 * Update heartbeat config for an agent
 * Body: { enabled?, intervalMinutes?, checklist?, quietHoursStart?, quietHoursEnd?, timezone? }
 */
proactiveRouter.put('/agents/:id/heartbeat', requireProactiveForAgent, validate(heartbeatConfigSchema), async (req, res) => {
  try {
    const agentId = req.params.id as string;
    const { enabled, intervalMinutes, checklist, quietHoursStart, quietHoursEnd, timezone } = req.body;

    // Basic validation
    if (intervalMinutes !== undefined && (typeof intervalMinutes !== 'number' || intervalMinutes < 1)) {
      return res.status(400).json({ error: 'intervalMinutes must be a positive number' });
    }

    const config = await upsertHeartbeatConfig(agentId, {
      enabled,
      intervalMinutes,
      checklist,
      quietHoursStart,
      quietHoursEnd,
      timezone,
    });

    res.json({
      agentId: config.agentId,
      enabled: config.enabled,
      intervalMinutes: config.intervalMinutes,
      checklist: config.checklist,
      quietHoursStart: config.quietHoursStart,
      quietHoursEnd: config.quietHoursEnd,
      timezone: config.timezone,
      lastHeartbeatAt: config.lastHeartbeatAt,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    });
  } catch (err) {
    console.error('[proactive-routes] Update heartbeat config error:', err);
    res.status(500).json({ error: 'Failed to update heartbeat config' });
  }
});

// ============================================================================
// Cron Jobs
// ============================================================================

/**
 * GET /api/agents/:id/cron
 * List all cron jobs for an agent
 */
proactiveRouter.get('/agents/:id/cron', requireProactiveForAgent, async (req, res) => {
  try {
    const agentId = req.params.id;
    const jobs = await listJobs(agentId);

    res.json({
      jobs: jobs.map((j) => ({
        id: j.id,
        agentId: j.agentId,
        schedule: j.schedule,
        taskText: j.taskText,
        model: j.model,
        enabled: j.enabled,
        lastRunAt: j.lastRunAt,
        nextRunAt: j.nextRunAt,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
      })),
    });
  } catch (err) {
    console.error('[proactive-routes] List cron jobs error:', err);
    res.status(500).json({ error: 'Failed to list cron jobs' });
  }
});

/**
 * POST /api/agents/:id/cron
 * Create a new cron job
 * Body: { schedule, taskText, model?, enabled? }
 */
proactiveRouter.post('/agents/:id/cron', requireProactiveForAgent, validate(cronJobCreateSchema), async (req, res) => {
  try {
    const agentId = req.params.id as string;
    const { schedule, taskText, model, enabled } = req.body;

    if (!schedule || typeof schedule !== 'string') {
      return res.status(400).json({ error: 'schedule is required (cron expression or interval)' });
    }
    if (!taskText || typeof taskText !== 'string') {
      return res.status(400).json({ error: 'taskText is required' });
    }

    const job = await createJob({ agentId, schedule, taskText, model, enabled });

    res.status(201).json({
      id: job.id,
      agentId: job.agentId,
      schedule: job.schedule,
      taskText: job.taskText,
      model: job.model,
      enabled: job.enabled,
      lastRunAt: job.lastRunAt,
      nextRunAt: job.nextRunAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create cron job';
    console.error('[proactive-routes] Create cron job error:', err);
    res.status(400).json({ error: message });
  }
});

/**
 * PUT /api/agents/:id/cron/:jobId
 * Update a cron job
 * Body: { schedule?, taskText?, model?, enabled? }
 */
proactiveRouter.put('/agents/:id/cron/:jobId', requireProactiveForAgent, async (req, res) => {
  try {
    const agentId = req.params.id;
    const jobId = parseInt(req.params.jobId, 10);
    const { schedule, taskText, model, enabled } = req.body;

    if (isNaN(jobId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    const job = await updateJob(jobId, agentId, { schedule, taskText, model, enabled });

    if (!job) {
      return res.status(404).json({ error: 'Cron job not found' });
    }

    res.json({
      id: job.id,
      agentId: job.agentId,
      schedule: job.schedule,
      taskText: job.taskText,
      model: job.model,
      enabled: job.enabled,
      lastRunAt: job.lastRunAt,
      nextRunAt: job.nextRunAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update cron job';
    console.error('[proactive-routes] Update cron job error:', err);
    res.status(400).json({ error: message });
  }
});

/**
 * DELETE /api/agents/:id/cron/:jobId
 * Delete a cron job
 */
proactiveRouter.delete('/agents/:id/cron/:jobId', requireProactiveForAgent, async (req, res) => {
  try {
    const agentId = req.params.id;
    const jobId = parseInt(req.params.jobId, 10);

    if (isNaN(jobId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    const deleted = await deleteJob(jobId, agentId);

    if (!deleted) {
      return res.status(404).json({ error: 'Cron job not found' });
    }

    res.json({ success: true, id: jobId });
  } catch (err) {
    console.error('[proactive-routes] Delete cron job error:', err);
    res.status(500).json({ error: 'Failed to delete cron job' });
  }
});

/**
 * POST /api/agents/:id/cron/:jobId/run
 * Manually trigger a cron job (executes immediately regardless of schedule)
 */
proactiveRouter.post('/agents/:id/cron/:jobId/run', requireProactiveForAgent, async (req, res) => {
  try {
    const agentId = req.params.id;
    const jobId = parseInt(req.params.jobId, 10);

    if (isNaN(jobId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    const job = await getJob(jobId, agentId);
    if (!job) {
      return res.status(404).json({ error: 'Cron job not found' });
    }

    // Execute immediately (fire-and-forget — don't block the response)
    executeJob(job).catch((err) => {
      console.error(`[proactive-routes] Manual cron run error for job ${jobId}:`, err);
    });

    res.json({
      message: 'Cron job triggered',
      jobId: job.id,
      taskText: job.taskText,
    });
  } catch (err) {
    console.error('[proactive-routes] Manual cron run error:', err);
    res.status(500).json({ error: 'Failed to trigger cron job' });
  }
});

// ============================================================================
// Task Run History
// ============================================================================

/**
 * GET /api/agents/:id/proactive/runs
 * List recent task runs for an agent (last 50)
 */
proactiveRouter.get('/agents/:id/proactive/runs', requireProactiveForAgent, async (req, res) => {
  try {
    const agentId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);

    const rows = await db
      .select()
      .from(agentTaskRuns)
      .where(eq(agentTaskRuns.agentId, agentId))
      .orderBy(desc(agentTaskRuns.startedAt))
      .limit(limit) as any[];

    res.json({
      runs: rows.map((r: any) => ({
        id: r.id,
        agentId: r.agentId,
        runType: r.runType,
        sourceId: r.sourceId,
        taskText: r.taskText,
        status: r.status,
        result: r.result,
        error: r.error,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
      })),
    });
  } catch (err) {
    console.error('[proactive-routes] List task runs error:', err);
    res.status(500).json({ error: 'Failed to list task runs' });
  }
});
