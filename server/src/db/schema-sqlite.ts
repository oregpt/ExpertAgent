/**
 * SQLite Schema for Desktop (Electron) Build
 *
 * Mirrors server/src/db/schema.ts but uses drizzle-orm/sqlite-core types.
 * Keep in sync with schema.ts — if you add/change a table there, update here too.
 *
 * Type Mappings:
 *   pgTable       → sqliteTable
 *   serial        → integer (autoIncrement)
 *   varchar       → text
 *   jsonb         → text (mode: 'json')
 *   boolean       → integer (mode: 'boolean')
 *   timestamp     → text (ISO-8601 strings)
 *   time          → text
 *   vector(1536)  → text (JSON-stringified number[])
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const agents = sqliteTable('ai_agents', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  instructions: text('instructions'),
  defaultModel: text('default_model').notNull(),
  modelMode: text('model_mode').default('single'),
  allowedModels: text('allowed_models', { mode: 'json' }),
  branding: text('branding', { mode: 'json' }),
  features: text('features', { mode: 'json' }),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

export const documents = sqliteTable('ai_documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull(),
  folderId: integer('folder_id'),
  category: text('category').default('knowledge'),
  title: text('title').notNull(),
  sourceType: text('source_type').notNull(),
  mimeType: text('mime_type'),
  size: integer('size'),
  storagePath: text('storage_path'),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

export const documentChunks = sqliteTable('ai_document_chunks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  documentId: integer('document_id').notNull(),
  agentId: text('agent_id').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  embedding: text('embedding'), // JSON-stringified number[] (was pgvector)
  tokenCount: integer('token_count'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

export const conversations = sqliteTable('ai_conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull(),
  externalUserId: text('external_user_id'),
  title: text('title'),
  channelType: text('channel_type'),
  channelId: text('channel_id'),
  sessionSummary: text('session_summary'),
  messageCount: integer('message_count').default(0),
  lastMessageAt: text('last_message_at'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

export const messages = sqliteTable('ai_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: integer('conversation_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

export const capabilities = sqliteTable('ai_capabilities', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').notNull(),
  category: text('category'),
  config: text('config', { mode: 'json' }),
  enabled: integer('enabled').notNull().default(1),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

export const agentCapabilities = sqliteTable('ai_agent_capabilities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull(),
  capabilityId: text('capability_id').notNull(),
  enabled: integer('enabled').notNull().default(1),
  config: text('config', { mode: 'json' }),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

export const capabilityTokens = sqliteTable('ai_capability_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull(),
  capabilityId: text('capability_id').notNull(),
  token1: text('token1'),
  token2: text('token2'),
  token3: text('token3'),
  token4: text('token4'),
  token5: text('token5'),
  iv: text('iv'),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

// v2: Soul & Memory
export const agentDocuments = sqliteTable('ai_agent_documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull(),
  docType: text('doc_type').notNull(),
  docKey: text('doc_key').notNull(),
  content: text('content').notNull().default(''),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

export const agentMemoryEmbeddings = sqliteTable('ai_agent_memory_embeddings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull(),
  docId: integer('doc_id').notNull(),
  chunkText: text('chunk_text').notNull(),
  embedding: text('embedding'), // JSON-stringified number[] (was pgvector)
  lineStart: integer('line_start'),
  lineEnd: integer('line_end'),
  contentHash: text('content_hash'), // SHA-256 for incremental embedding
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

// v2: Proactive Engine
export const agentCronJobs = sqliteTable('ai_agent_cron_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull(),
  schedule: text('schedule').notNull(),
  taskText: text('task_text').notNull(),
  model: text('model'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  lastRunAt: text('last_run_at'),
  nextRunAt: text('next_run_at'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

export const agentHeartbeatConfig = sqliteTable('ai_agent_heartbeat_config', {
  agentId: text('agent_id').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).default(false),
  intervalMinutes: integer('interval_minutes').default(30),
  checklist: text('checklist'),
  quietHoursStart: text('quiet_hours_start'),
  quietHoursEnd: text('quiet_hours_end'),
  timezone: text('timezone').default('UTC'),
  lastHeartbeatAt: text('last_heartbeat_at'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

export const agentTaskRuns = sqliteTable('ai_agent_task_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull(),
  runType: text('run_type').notNull(),
  sourceId: integer('source_id'),
  taskText: text('task_text'),
  status: text('status').default('running'),
  result: text('result'),
  startedAt: text('started_at').$defaultFn(() => new Date().toISOString()).notNull(),
  completedAt: text('completed_at'),
  error: text('error'),
});

// v2: Multi-Channel
export const agentChannels = sqliteTable('ai_agent_channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull(),
  channelType: text('channel_type').notNull(),
  channelName: text('channel_name'),
  config: text('config', { mode: 'json' }).notNull().default('{}'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

// Legacy
export const capabilitySecrets = sqliteTable('ai_capability_secrets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  capabilityId: text('capability_id').notNull(),
  name: text('name').notNull(),
  encryptedValue: text('encrypted_value').notNull(),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

export const agentApiKeys = sqliteTable('ai_agent_api_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull(),
  key: text('key').notNull(),
  encryptedValue: text('encrypted_value').notNull(),
  iv: text('iv'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

// KB Enhancement
export const folders = sqliteTable('ai_folders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull(),
  parentId: integer('parent_id'),
  name: text('name').notNull(),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

export const tags = sqliteTable('ai_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull(),
  name: text('name').notNull(),
  color: text('color').default('#6b7280'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

export const documentTags = sqliteTable('ai_document_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  documentId: integer('document_id').notNull(),
  tagId: integer('tag_id').notNull(),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

// GitLab KB
export const gitlabConnections = sqliteTable('ai_gitlab_connections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull().unique(),
  projectUrl: text('project_url').notNull(),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  tokenIv: text('token_iv'),
  branch: text('branch').default('main'),
  pathFilter: text('path_filter').default('/'),
  fileExtensions: text('file_extensions', { mode: 'json' }),
  convertAsciidoc: integer('convert_asciidoc').default(1),
  docsBaseUrl: text('docs_base_url'),
  productContext: text('product_context'),
  productMappings: text('product_mappings', { mode: 'json' }),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()).notNull(),
});

export const gitlabRefreshes = sqliteTable('ai_gitlab_refreshes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull(),
  status: text('status').notNull().default('running'),
  startedAt: text('started_at').$defaultFn(() => new Date().toISOString()).notNull(),
  completedAt: text('completed_at'),
  filesProcessed: integer('files_processed').default(0),
  filesConverted: integer('files_converted').default(0),
  filesSkipped: integer('files_skipped').default(0),
  errorMessage: text('error_message'),
  archivePath: text('archive_path'),
  archiveSize: integer('archive_size'),
  commitSha: text('commit_sha'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()).notNull(),
});
