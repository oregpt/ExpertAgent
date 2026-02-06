/**
 * Schema Entry Point — Conditional Re-export
 *
 * Desktop mode (IS_DESKTOP=true):  loads schema-sqlite.ts  (sqlite-core)
 * Cloud mode   (default):          loads schema-pg.ts       (pg-core)
 *
 * All 20+ consumer files import from './schema' — this keeps them unchanged.
 */

import type * as PgSchema from './schema-pg';

const IS_DESKTOP = process.env.IS_DESKTOP === 'true';

// Runtime: load the appropriate schema
const schema: typeof PgSchema = IS_DESKTOP
  ? require('./schema-sqlite')
  : require('./schema-pg');

// Re-export all tables so existing `import { agents } from '../db/schema'` keeps working
export const {
  agents,
  documents,
  documentChunks,
  conversations,
  messages,
  capabilities,
  agentCapabilities,
  capabilityTokens,
  agentDocuments,
  agentMemoryEmbeddings,
  agentCronJobs,
  agentHeartbeatConfig,
  agentTaskRuns,
  agentChannels,
  capabilitySecrets,
  agentApiKeys,
  folders,
  tags,
  documentTags,
  gitlabConnections,
  gitlabRefreshes,
} = schema;
