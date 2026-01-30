import { pgTable, text, varchar, timestamp, integer, serial, jsonb, customType } from 'drizzle-orm/pg-core';

// Custom type for pgvector - stores as vector but accepts/returns number[]
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)'; // OpenAI text-embedding-3-small dimension
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    // Parse "[1,2,3]" format from pgvector
    const cleaned = value.replace(/^\[|\]$/g, '');
    return cleaned ? cleaned.split(',').map(Number) : [];
  },
});

export const agents = pgTable('ai_agents', {
  id: varchar('id', { length: 64 }).primaryKey(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  instructions: text('instructions'),
  defaultModel: varchar('default_model', { length: 128 }).notNull(),
  modelMode: varchar('model_mode', { length: 16 }).default('single'), // 'single' | 'multi'
  allowedModels: jsonb('allowed_models'), // Array of model IDs when modelMode is 'multi'
  branding: jsonb('branding'), // Full branding/theme settings (AgentTheme object)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const documents = pgTable('ai_documents', {
  id: serial('id').primaryKey(),
  agentId: varchar('agent_id', { length: 64 }).notNull(),
  folderId: integer('folder_id'), // NULL = root/unfiled, references ai_folders(id)
  category: varchar('category', { length: 16 }).default('knowledge'), // 'knowledge', 'code', 'data'
  title: varchar('title', { length: 255 }).notNull(),
  sourceType: varchar('source_type', { length: 32 }).notNull(),
  mimeType: varchar('mime_type', { length: 128 }),
  size: integer('size'),
  storagePath: varchar('storage_path', { length: 512 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const documentChunks = pgTable('ai_document_chunks', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id').notNull(),
  agentId: varchar('agent_id', { length: 64 }).notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding'), // pgvector for similarity search
  tokenCount: integer('token_count'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const conversations = pgTable('ai_conversations', {
  id: serial('id').primaryKey(),
  agentId: varchar('agent_id', { length: 64 }).notNull(),
  externalUserId: varchar('external_user_id', { length: 255 }),
  title: varchar('title', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const messages = pgTable('ai_messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').notNull(),
  role: varchar('role', { length: 16 }).notNull(), // user | assistant | system
  content: text('content').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Capability registry - what capabilities exist in the system
// type: 'mcp' (normal MCP server) or 'anyapi' (JSON-configurable API)
export const capabilities = pgTable('ai_capabilities', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  type: varchar('type', { length: 32 }).notNull(), // 'mcp' | 'anyapi'
  category: varchar('category', { length: 64 }), // 'finance', 'communication', 'data', etc.
  config: jsonb('config'), // For 'anyapi': API definition JSON; For 'mcp': server config
  enabled: integer('enabled').notNull().default(1), // Global enable/disable
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Per-agent capability enablement - which agents have which capabilities
export const agentCapabilities = pgTable('ai_agent_capabilities', {
  id: serial('id').primaryKey(),
  agentId: varchar('agent_id', { length: 64 }).notNull(),
  capabilityId: varchar('capability_id', { length: 64 }).notNull(),
  enabled: integer('enabled').notNull().default(1),
  config: jsonb('config'), // Agent-specific overrides
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Per-agent capability credentials - encrypted tokens/keys
export const capabilityTokens = pgTable('ai_capability_tokens', {
  id: serial('id').primaryKey(),
  agentId: varchar('agent_id', { length: 64 }).notNull(),
  capabilityId: varchar('capability_id', { length: 64 }).notNull(),
  // Flexible token storage (up to 5 fields for complex auth)
  token1: text('token1'), // Primary: API key, OAuth access token
  token2: text('token2'), // Secondary: secret key, refresh token
  token3: text('token3'), // Additional: account ID, project ID
  token4: text('token4'),
  token5: text('token5'),
  // Encryption metadata (AES-256-GCM)
  iv: varchar('iv', { length: 32 }), // Initialization vector
  expiresAt: timestamp('expires_at'), // For OAuth tokens
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Legacy table - keeping for backwards compatibility
export const capabilitySecrets = pgTable('ai_capability_secrets', {
  id: serial('id').primaryKey(),
  capabilityId: varchar('capability_id', { length: 64 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  encryptedValue: text('encrypted_value').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Per-agent API keys - encrypted storage (env vars are fallback)
export const agentApiKeys = pgTable('ai_agent_api_keys', {
  id: serial('id').primaryKey(),
  agentId: varchar('agent_id', { length: 64 }).notNull(),
  key: varchar('key', { length: 64 }).notNull(), // e.g., 'anthropic_api_key', 'openai_api_key'
  encryptedValue: text('encrypted_value').notNull(),
  iv: varchar('iv', { length: 32 }), // Initialization vector for AES-256-GCM
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================================
// Knowledge Base Enhancement - Folders, Tags, Categories
// ============================================================================

// Folder hierarchy for organizing documents (like Google Drive)
export const folders = pgTable('ai_folders', {
  id: serial('id').primaryKey(),
  agentId: varchar('agent_id', { length: 64 }).notNull(),
  parentId: integer('parent_id'), // NULL = root folder, references ai_folders(id)
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Tags for labeling documents (per-agent)
export const tags = pgTable('ai_tags', {
  id: serial('id').primaryKey(),
  agentId: varchar('agent_id', { length: 64 }).notNull(),
  name: varchar('name', { length: 64 }).notNull(),
  color: varchar('color', { length: 7 }).default('#6b7280'), // hex color
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Many-to-many: documents <-> tags
export const documentTags = pgTable('ai_document_tags', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id').notNull(),
  tagId: integer('tag_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// GitLab KB Refresh - Sync documentation from GitLab repositories
// ============================================================================

// GitLab connection configuration (one per agent)
export const gitlabConnections = pgTable('ai_gitlab_connections', {
  id: serial('id').primaryKey(),
  agentId: varchar('agent_id', { length: 64 }).notNull().unique(),

  // GitLab Connection
  projectUrl: varchar('project_url', { length: 500 }).notNull(),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  tokenIv: varchar('token_iv', { length: 32 }),
  branch: varchar('branch', { length: 100 }).default('main'),
  pathFilter: varchar('path_filter', { length: 500 }).default('/'),

  // Options
  fileExtensions: jsonb('file_extensions'), // Array of extensions like ['.md', '.adoc']
  convertAsciidoc: integer('convert_asciidoc').default(1),
  docsBaseUrl: varchar('docs_base_url', { length: 500 }), // e.g., 'https://docs.example.com'
  productContext: varchar('product_context', { length: 255 }), // e.g., 'Catalyst Blockchain Manager'

  // Product mappings (e.g., {"catbm": "general"})
  productMappings: jsonb('product_mappings'),

  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// GitLab refresh history
export const gitlabRefreshes = pgTable('ai_gitlab_refreshes', {
  id: serial('id').primaryKey(),
  agentId: varchar('agent_id', { length: 64 }).notNull(),

  // Status
  status: varchar('status', { length: 20 }).notNull().default('running'), // running | completed | failed
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),

  // Results
  filesProcessed: integer('files_processed').default(0),
  filesConverted: integer('files_converted').default(0),
  filesSkipped: integer('files_skipped').default(0),
  errorMessage: text('error_message'),

  // Archive
  archivePath: varchar('archive_path', { length: 500 }),
  archiveSize: integer('archive_size'),

  // Metadata
  commitSha: varchar('commit_sha', { length: 40 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
