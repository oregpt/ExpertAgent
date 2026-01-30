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
      console.log('[proactive] Engine disabled (proactive feature flag is off)');
      return;
    }

    if (this.running) {
      console.warn('[proactive] Engine already running');
      return;
    }

    this.running = true;
    console.log('[proactive] Engine started — polling every 60s');

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
    console.log('[proactive] Engine stopped');
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
      console.error('[proactive] Poll cycle error:', err);
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
            console.error(`[proactive] Heartbeat execution error for agent ${config.agentId}:`, err);
          });
        }
      }
    } catch (err) {
      console.error('[proactive] Heartbeat check error:', err);
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
          console.error(`[proactive] Cron execution error for job ${job.id}:`, err);
        });
      }
    } catch (err) {
      console.error('[proactive] Cron check error:', err);
    }
  }
}

// Export singleton instance
export const proactiveEngine = new ProactiveEngine();
