/**
 * Session Module — barrel export
 *
 * Phase 5: Session Continuity
 * - Session management (get/create sessions, activity tracking, summarization)
 * - Context building (system prompt, memory recall, history, session summaries)
 * - Memory distillation (daily logs → long-term memory)
 */

// Session Manager
export {
  getOrCreateSession,
  updateSessionActivity,
  shouldSummarize,
  summarizeSession,
  getRecentSessions,
  getSession,
} from './sessionManager';
export type { Session, SessionSummary } from './sessionManager';

// Context Builder
export { buildContext } from './contextBuilder';
export type { BuiltContext, BuildContextOptions } from './contextBuilder';

// Memory Distiller
export { distillMemory, runDistillation } from './memoryDistiller';
export type { DistillationResult } from './memoryDistiller';
