/**
 * Proactive Module — barrel export
 */

export { proactiveEngine } from './proactiveEngine';

export {
  getConfig as getHeartbeatConfig,
  upsertConfig as upsertHeartbeatConfig,
  isDue as isHeartbeatDue,
  executeHeartbeat,
  getAllEnabledConfigs,
} from './heartbeatService';
export type { HeartbeatConfig, UpsertHeartbeatInput } from './heartbeatService';

export {
  createJob,
  updateJob,
  deleteJob,
  listJobs,
  getJob,
  getDueJobs,
  executeJob,
  calculateNextRun,
} from './cronService';
export type { CronJob, CreateCronJobInput, UpdateCronJobInput } from './cronService';

export { spawnTask } from './backgroundAgent';
export type { SpawnTaskOptions, TaskResult } from './backgroundAgent';
