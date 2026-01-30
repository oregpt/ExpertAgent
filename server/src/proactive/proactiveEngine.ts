/**
 * Proactive Engine
 *
 * Singleton service that polls for due heartbeats and cron jobs on a 60-second
 * interval. Executes them by calling the chat service, exactly like a user
 * message would, but with system-generated prompts.
 *
 * - If `proactive` feature flag is OFF, start() is a no-op.
 * - In-process only — no Redis, no Bull, just setInterval.
 * - Every execution is logged to ai_agent_task_runs for auditing.
 */

import { getFeatures } from '../licensing/features';
import { getAllEnabledConfigs, isDue, executeHeartbeat } from './heartbeatService';
import { getDueJobs, executeJob } from './cronService';
import { channelRouter } from '../channels/channelRouter';
import { logger } from '../utils/logger';

// ============================================================================
// Singleton
// ============================================================================

const POLL_INTERVAL_MS = 60_000; // 60 seconds

class ProactiveEngine {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private polling = false; // guard against overlapping poll cycles

  /**
   * Start the proactive engine polling loop.
   * No-op if `proactive` feature flag is disabled.
   */
  start(): void {
    const features = getFeatures();
    if (!features.proactive) {
      logger.info('Proactive engine disabled (feature flag off)');
      return;
    }

    if (this.running) {
      logger.warn('Proactive engine already running');
      return;
    }

    this.running = true;
    logger.info('Proactive engine started', { pollIntervalMs: POLL_INTERVAL_MS });

    // Run first poll shortly after startup (give DB time to settle)
    setTimeout(() => this.poll(), 5000);

    // Then poll every 60 seconds
    this.intervalHandle = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  /**
   * Stop the proactive engine and clean up.
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.running = false;
    logger.info('Proactive engine stopped');
  }

  /**
   * Single poll cycle: check for due heartbeats and cron jobs, execute them.
   */
  private async poll(): Promise<void> {
    if (this.polling) {
      // Previous poll cycle still running — skip this one
      return;
    }

    this.polling = true;

    try {
      // 1. Check heartbeats
      await this.checkHeartbeats();

      // 2. Check cron jobs
      await this.checkCronJobs();
    } catch (err) {
      logger.error('Proactive poll cycle error', { error: (err as Error).message });
    } finally {
      this.polling = false;
    }
  }

  /**
   * Check all enabled heartbeat configs and execute any that are due.
   */
  private async checkHeartbeats(): Promise<void> {
    try {
      const configs = await getAllEnabledConfigs();
      for (const config of configs) {
        if (isDue(config)) {
          // Execute heartbeat asynchronously (don't block other checks)
          executeHeartbeat(config.agentId).catch((err) => {
            logger.error('Heartbeat execution error', { agentId: config.agentId, error: (err as Error).message });
          });
        }
      }
    } catch (err) {
      logger.error('Heartbeat check error', { error: (err as Error).message });
    }
  }

  /**
   * Check for due cron jobs and execute them.
   */
  private async checkCronJobs(): Promise<void> {
    try {
      const dueJobs = await getDueJobs();
      for (const job of dueJobs) {
        // Execute each job asynchronously (don't block other jobs)
        executeJob(job).catch((err) => {
          logger.error('Cron execution error', { jobId: job.id, error: (err as Error).message });
        });
      }
    } catch (err) {
      logger.error('Cron check error', { error: (err as Error).message });
    }
  }
}

// Export singleton instance
export const proactiveEngine = new ProactiveEngine();
