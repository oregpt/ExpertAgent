import { db } from './client';
import { sql } from 'drizzle-orm';

const IS_DESKTOP = process.env.IS_DESKTOP === 'true';

// ============================================================================
// SQLite Initialization (Desktop Mode)
// ============================================================================

async function initializeSQLite(): Promise<void> {
  const { rawSqlite } = require('./client-sqlite');

  const ddl = `
    CREATE TABLE IF NOT EXISTS ai_agents (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      instructions TEXT,
      default_model TEXT NOT NULL,
      model_mode TEXT DEFAULT 'single',
      allowed_models TEXT,
      branding TEXT,
      features TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      folder_id INTEGER,
      category TEXT DEFAULT 'knowledge',
      title TEXT NOT NULL,
      source_type TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      storage_path TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_document_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      agent_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding TEXT,
      token_count INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      external_user_id TEXT,
      title TEXT,
      channel_type TEXT,
      channel_id TEXT,
      session_summary TEXT,
      message_count INTEGER DEFAULT 0,
      last_message_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_capabilities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      category TEXT,
      config TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_agent_capabilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      config TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_capability_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      token1 TEXT,
      token2 TEXT,
      token3 TEXT,
      token4 TEXT,
      token5 TEXT,
      iv TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_agent_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      doc_key TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_agent_memory_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      doc_id INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      embedding TEXT,
      line_start INTEGER,
      line_end INTEGER,
      content_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_agent_cron_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      schedule TEXT NOT NULL,
      task_text TEXT NOT NULL,
      model TEXT,
      enabled INTEGER DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_agent_heartbeat_config (
      agent_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      interval_minutes INTEGER DEFAULT 30,
      checklist TEXT,
      quiet_hours_start TEXT,
      quiet_hours_end TEXT,
      timezone TEXT DEFAULT 'UTC',
      last_heartbeat_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_agent_task_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      run_type TEXT NOT NULL,
      source_id INTEGER,
      task_text TEXT,
      status TEXT DEFAULT 'running',
      result TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_agent_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      channel_name TEXT,
      config TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_capability_secrets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      capability_id TEXT NOT NULL,
      name TEXT NOT NULL,
      encrypted_value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_agent_api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      key TEXT NOT NULL,
      encrypted_value TEXT NOT NULL,
      iv TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(agent_id, key)
    );

    CREATE TABLE IF NOT EXISTS ai_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      parent_id INTEGER,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6b7280',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(agent_id, name)
    );

    CREATE TABLE IF NOT EXISTS ai_document_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(document_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS ai_gitlab_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL UNIQUE,
      project_url TEXT NOT NULL,
      access_token_encrypted TEXT NOT NULL,
      token_iv TEXT,
      branch TEXT DEFAULT 'main',
      path_filter TEXT DEFAULT '/',
      file_extensions TEXT,
      convert_asciidoc INTEGER DEFAULT 1,
      docs_base_url TEXT,
      product_context TEXT,
      product_mappings TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_gitlab_refreshes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      files_processed INTEGER DEFAULT 0,
      files_converted INTEGER DEFAULT 0,
      files_skipped INTEGER DEFAULT 0,
      error_message TEXT,
      archive_path TEXT,
      archive_size INTEGER,
      commit_sha TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `;

  // Execute each statement separately (SQLite doesn't support multi-statement exec in one call)
  const statements = ddl
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    rawSqlite.exec(stmt + ';');
  }

  // Create indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_documents_agent_id ON ai_documents(agent_id)',
    'CREATE INDEX IF NOT EXISTS idx_documents_folder ON ai_documents(folder_id)',
    'CREATE INDEX IF NOT EXISTS idx_documents_category ON ai_documents(category)',
    'CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON ai_document_chunks(document_id)',
    'CREATE INDEX IF NOT EXISTS idx_document_chunks_agent_id ON ai_document_chunks(agent_id)',
    'CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON ai_messages(conversation_id)',
    'CREATE INDEX IF NOT EXISTS idx_conversations_agent_id ON ai_conversations(agent_id)',
    'CREATE INDEX IF NOT EXISTS idx_agent_capabilities_agent ON ai_agent_capabilities(agent_id)',
    'CREATE INDEX IF NOT EXISTS idx_capability_tokens_agent ON ai_capability_tokens(agent_id, capability_id)',
    'CREATE INDEX IF NOT EXISTS idx_agent_api_keys_agent ON ai_agent_api_keys(agent_id)',
    'CREATE INDEX IF NOT EXISTS idx_agent_documents_agent_type ON ai_agent_documents(agent_id, doc_type)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_documents_agent_key ON ai_agent_documents(agent_id, doc_key)',
    'CREATE INDEX IF NOT EXISTS idx_agent_memory_embeddings_agent ON ai_agent_memory_embeddings(agent_id)',
    'CREATE INDEX IF NOT EXISTS idx_agent_memory_embeddings_doc ON ai_agent_memory_embeddings(doc_id)',
    'CREATE INDEX IF NOT EXISTS idx_agent_memory_embeddings_hash ON ai_agent_memory_embeddings(doc_id, content_hash)',
    'CREATE INDEX IF NOT EXISTS idx_cron_agent ON ai_agent_cron_jobs(agent_id)',
    'CREATE INDEX IF NOT EXISTS idx_task_runs_agent ON ai_agent_task_runs(agent_id)',
    'CREATE INDEX IF NOT EXISTS idx_channels_agent ON ai_agent_channels(agent_id)',
    'CREATE INDEX IF NOT EXISTS idx_folders_agent ON ai_folders(agent_id)',
    'CREATE INDEX IF NOT EXISTS idx_tags_agent ON ai_tags(agent_id)',
    'CREATE INDEX IF NOT EXISTS idx_document_tags_document ON ai_document_tags(document_id)',
    'CREATE INDEX IF NOT EXISTS idx_document_tags_tag ON ai_document_tags(tag_id)',
    'CREATE INDEX IF NOT EXISTS idx_gitlab_connections_agent ON ai_gitlab_connections(agent_id)',
    'CREATE INDEX IF NOT EXISTS idx_gitlab_refreshes_agent ON ai_gitlab_refreshes(agent_id)',
  ];

  for (const idx of indexes) {
    rawSqlite.exec(idx);
  }

  console.log('[db-sqlite] All 21 tables and indexes created/verified');
}

// ============================================================================
// PostgreSQL Initialization (Cloud Mode)
// ============================================================================

/**
 * Create all required tables if they don't exist
 */
async function createTablesIfNotExist(): Promise<void> {
  // Agents table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_agents (
      id VARCHAR(64) PRIMARY KEY,
      slug VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      instructions TEXT,
      default_model VARCHAR(128) NOT NULL,
      model_mode VARCHAR(16) DEFAULT 'single',
      allowed_models JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  // Add new columns if they don't exist (for existing databases)
  await db.execute(sql`
    ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS model_mode VARCHAR(16) DEFAULT 'single'
  `).catch(() => {});
  await db.execute(sql`
    ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS allowed_models JSONB
  `).catch(() => {});
  await db.execute(sql`
    ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS branding JSONB
  `).catch(() => {});
  await db.execute(sql`
    ALTER TABLE ai_capabilities ADD COLUMN IF NOT EXISTS category VARCHAR(64)
  `).catch(() => {});
  await db.execute(sql`
    ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}'
  `).catch(() => {});

  // Documents table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_documents (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      source_type VARCHAR(32) NOT NULL,
      mime_type VARCHAR(128),
      size INTEGER,
      storage_path VARCHAR(512),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  // Document chunks table (with pgvector if available)
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_document_chunks (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL,
        agent_id VARCHAR(64) NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding vector(1536),
        token_count INTEGER,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
  } catch {
    // Fallback without vector column if pgvector not available
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_document_chunks (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL,
        agent_id VARCHAR(64) NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding TEXT,
        token_count INTEGER,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.warn('[db] Created ai_document_chunks without vector type (pgvector not available)');
  }

  // Conversations table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(64) NOT NULL,
      external_user_id VARCHAR(255),
      title VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  // Messages table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL,
      role VARCHAR(16) NOT NULL,
      content TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  // Capabilities table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_capabilities (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      type VARCHAR(32) NOT NULL,
      category VARCHAR(64),
      config JSONB,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  // Agent capabilities table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_agent_capabilities (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(64) NOT NULL,
      capability_id VARCHAR(64) NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      config JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  // Capability tokens table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_capability_tokens (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(64) NOT NULL,
      capability_id VARCHAR(64) NOT NULL,
      token1 TEXT,
      token2 TEXT,
      token3 TEXT,
      token4 TEXT,
      token5 TEXT,
      iv VARCHAR(32),
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  // Legacy capability secrets table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_capability_secrets (
      id SERIAL PRIMARY KEY,
      capability_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      encrypted_value TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  // Per-agent API keys table (env vars are fallback)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_agent_api_keys (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(64) NOT NULL,
      key VARCHAR(64) NOT NULL,
      encrypted_value TEXT NOT NULL,
      iv VARCHAR(32),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      UNIQUE(agent_id, key)
    )
  `);

  // ============================================================================
  // Knowledge Base Enhancement - Folders, Tags, Categories
  // ============================================================================

  // Folders table (hierarchical structure)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_folders (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(64) NOT NULL,
      parent_id INTEGER REFERENCES ai_folders(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  // Tags table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_tags (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(64) NOT NULL,
      name VARCHAR(64) NOT NULL,
      color VARCHAR(7) DEFAULT '#6b7280',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      UNIQUE(agent_id, name)
    )
  `);

  // Document-Tags junction table (many-to-many)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_document_tags (
      id SERIAL PRIMARY KEY,
      document_id INTEGER NOT NULL REFERENCES ai_documents(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES ai_tags(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      UNIQUE(document_id, tag_id)
    )
  `);

  // Add folder_id and category columns to documents if they don't exist
  await db.execute(sql`
    ALTER TABLE ai_documents ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES ai_folders(id) ON DELETE SET NULL
  `).catch(() => {});
  await db.execute(sql`
    ALTER TABLE ai_documents ADD COLUMN IF NOT EXISTS category VARCHAR(16) DEFAULT 'knowledge'
  `).catch(() => {});

  // Create indexes for better query performance
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_folders_agent ON ai_folders(agent_id)
  `).catch(() => {});
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_folders_parent ON ai_folders(parent_id)
  `).catch(() => {});
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_tags_agent ON ai_tags(agent_id)
  `).catch(() => {});
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_documents_folder ON ai_documents(folder_id)
  `).catch(() => {});
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_documents_category ON ai_documents(category)
  `).catch(() => {});

  // ============================================================================
  // GitLab KB Refresh Tables
  // ============================================================================

  // GitLab connections table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_gitlab_connections (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(64) NOT NULL UNIQUE,
      project_url VARCHAR(500) NOT NULL,
      access_token_encrypted TEXT NOT NULL,
      token_iv VARCHAR(32),
      branch VARCHAR(100) DEFAULT 'main',
      path_filter VARCHAR(500) DEFAULT '/',
      file_extensions JSONB,
      convert_asciidoc INTEGER DEFAULT 1,
      docs_base_url VARCHAR(500),
      product_context VARCHAR(255),
      product_mappings JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  // GitLab refreshes (history) table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_gitlab_refreshes (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(64) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'running',
      started_at TIMESTAMP DEFAULT NOW() NOT NULL,
      completed_at TIMESTAMP,
      files_processed INTEGER DEFAULT 0,
      files_converted INTEGER DEFAULT 0,
      files_skipped INTEGER DEFAULT 0,
      error_message TEXT,
      archive_path VARCHAR(500),
      archive_size INTEGER,
      commit_sha VARCHAR(40),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  // Indexes for GitLab tables
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_gitlab_connections_agent ON ai_gitlab_connections(agent_id)
  `).catch(() => {});
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_gitlab_refreshes_agent ON ai_gitlab_refreshes(agent_id)
  `).catch(() => {});
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_gitlab_refreshes_status ON ai_gitlab_refreshes(status)
  `).catch(() => {});

  // ============================================================================
  // v2: Soul & Memory System Tables
  // ============================================================================

  // Agent documents table (soul.md, memory.md, context.md, daily/*.md)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_agent_documents (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(64) NOT NULL,
      doc_type VARCHAR(50) NOT NULL,
      doc_key VARCHAR(255) NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  // Indexes for agent documents
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_agent_documents_agent_type
    ON ai_agent_documents(agent_id, doc_type)
  `).catch(() => {});
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_documents_agent_key
    ON ai_agent_documents(agent_id, doc_key)
  `).catch(() => {});

  // Agent memory embeddings table (chunked vectors for semantic search)
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_agent_memory_embeddings (
        id SERIAL PRIMARY KEY,
        agent_id VARCHAR(64) NOT NULL,
        doc_id INTEGER NOT NULL REFERENCES ai_agent_documents(id) ON DELETE CASCADE,
        chunk_text TEXT NOT NULL,
        embedding vector(1536),
        line_start INTEGER,
        line_end INTEGER,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
  } catch {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_agent_memory_embeddings (
        id SERIAL PRIMARY KEY,
        agent_id VARCHAR(64) NOT NULL,
        doc_id INTEGER NOT NULL REFERENCES ai_agent_documents(id) ON DELETE CASCADE,
        chunk_text TEXT NOT NULL,
        embedding TEXT,
        line_start INTEGER,
        line_end INTEGER,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.warn('[db] Created ai_agent_memory_embeddings without vector type (pgvector not available)');
  }

  // Indexes for memory embeddings
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_agent_memory_embeddings_agent
    ON ai_agent_memory_embeddings(agent_id)
  `).catch(() => {});
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_agent_memory_embeddings_doc
    ON ai_agent_memory_embeddings(doc_id)
  `).catch(() => {});

  // Vector similarity index (HNSW is more reliable for small/empty datasets)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_agent_memory_embeddings_vector
    ON ai_agent_memory_embeddings
    USING hnsw (embedding vector_cosine_ops)
  `).catch(() => {
    console.log('[db] HNSW vector index creation skipped (may already exist or pgvector not ready)');
  });

  // ============================================================================
  // v2: Proactive Engine Tables
  // ============================================================================

  // Agent cron jobs table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_agent_cron_jobs (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(64) NOT NULL,
      schedule VARCHAR(100) NOT NULL,
      task_text TEXT NOT NULL,
      model VARCHAR(100),
      enabled BOOLEAN DEFAULT true,
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Indexes for cron jobs
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_cron_agent ON ai_agent_cron_jobs(agent_id)
  `).catch(() => {});
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_cron_next_run ON ai_agent_cron_jobs(next_run_at) WHERE enabled = true
  `).catch(() => {});

  // Agent heartbeat config table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_agent_heartbeat_config (
      agent_id VARCHAR(64) PRIMARY KEY,
      enabled BOOLEAN DEFAULT false,
      interval_minutes INT DEFAULT 30,
      checklist TEXT,
      quiet_hours_start TIME,
      quiet_hours_end TIME,
      timezone VARCHAR(50) DEFAULT 'UTC',
      last_heartbeat_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Agent task runs table (audit log)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_agent_task_runs (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(64) NOT NULL,
      run_type VARCHAR(20) NOT NULL,
      source_id INT,
      task_text TEXT,
      status VARCHAR(20) DEFAULT 'running',
      result TEXT,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      error TEXT
    )
  `);

  // Index for task runs
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_task_runs_agent ON ai_agent_task_runs(agent_id)
  `).catch(() => {});

  // ============================================================================
  // v2: Multi-Channel Delivery Table
  // ============================================================================

  // Agent channels table (Slack, Teams, Webhook integrations)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_agent_channels (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(64) NOT NULL,
      channel_type VARCHAR(50) NOT NULL,
      channel_name VARCHAR(100),
      config JSONB NOT NULL DEFAULT '{}',
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Indexes for agent channels
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_channels_agent ON ai_agent_channels(agent_id)
  `).catch(() => {});
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_channels_type ON ai_agent_channels(channel_type)
  `).catch(() => {});

  // ============================================================================
  // v2 Phase 5: Session Continuity — Enhance Conversations Table
  // ============================================================================

  // Add session metadata columns to conversations table
  await db.execute(sql`
    ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS channel_type VARCHAR(50)
  `).catch(() => {});
  await db.execute(sql`
    ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS channel_id VARCHAR(255)
  `).catch(() => {});
  await db.execute(sql`
    ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS session_summary TEXT
  `).catch(() => {});
  await db.execute(sql`
    ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS message_count INT DEFAULT 0
  `).catch(() => {});
  await db.execute(sql`
    ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ
  `).catch(() => {});

  // Indexes for session queries
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_conversations_agent_channel
    ON ai_conversations(agent_id, channel_type, channel_id)
  `).catch(() => {});
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_conversations_last_message
    ON ai_conversations(agent_id, last_message_at DESC)
  `).catch(() => {});

  // ============================================================================
  // Performance Indexes — Critical for production load
  // ============================================================================
  // These cover all high-frequency query paths. Without them, the system
  // degrades at ~10K messages per agent or ~50 concurrent agents.

  // Chat performance: messages are always queried by conversation
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON ai_messages(conversation_id)
  `).catch(() => {});

  // Conversations are queried by agent frequently
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_conversations_agent_id ON ai_conversations(agent_id)
  `).catch(() => {});

  // Sorted conversation listing (most recent first)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_conversations_agent_last_msg ON ai_conversations(agent_id, last_message_at DESC)
  `).catch(() => {});

  // Proactive engine: efficient cron polling (partial index)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_cron_jobs_enabled_next ON ai_agent_cron_jobs(enabled, next_run_at) WHERE enabled = true
  `).catch(() => {});

  // Task run history per agent
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_task_runs_agent_started ON ai_agent_task_runs(agent_id, started_at DESC)
  `).catch(() => {});

  // Channel lookups by agent + enabled status
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_agent_channels_agent_enabled ON ai_agent_channels(agent_id, enabled)
  `).catch(() => {});

  // Knowledge base documents queried by agent
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_documents_agent_id ON ai_documents(agent_id)
  `).catch(() => {});

  // Documents queried by folder
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON ai_documents(folder_id)
  `).catch(() => {});

  // Document chunks queried by parent document and by agent
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON ai_document_chunks(document_id)
  `).catch(() => {});
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_document_chunks_agent_id ON ai_document_chunks(agent_id)
  `).catch(() => {});

  // Capabilities per agent
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_agent_capabilities_agent ON ai_agent_capabilities(agent_id)
  `).catch(() => {});

  // Capability tokens per agent+capability
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_capability_tokens_agent ON ai_capability_tokens(agent_id, capability_id)
  `).catch(() => {});

  // Agent API keys by agent
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_agent_api_keys_agent ON ai_agent_api_keys(agent_id)
  `).catch(() => {});

  // Document tags junction table
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_document_tags_document ON ai_document_tags(document_id)
  `).catch(() => {});
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_document_tags_tag ON ai_document_tags(tag_id)
  `).catch(() => {});

  // GitLab refreshes: recent history per agent
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_gitlab_refreshes_agent_started ON ai_gitlab_refreshes(agent_id, started_at DESC)
  `).catch(() => {});

  // Content hash column for incremental embedding (Fix 5)
  await db.execute(sql`
    ALTER TABLE ai_agent_memory_embeddings ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64)
  `).catch(() => {});
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_agent_memory_embeddings_hash ON ai_agent_memory_embeddings(doc_id, content_hash)
  `).catch(() => {});

  console.log('[db] All tables and indexes created/verified (including v2 soul & memory + proactive engine + channels + session continuity + performance indexes)');
}

/**
 * Initialize database with required extensions and schema updates
 */
export async function initializeDatabase(): Promise<void> {
  // Desktop mode: SQLite initialization
  if (IS_DESKTOP) {
    try {
      await initializeSQLite();
      console.log('[db] SQLite database initialization complete');
    } catch (error) {
      console.error('[db] SQLite initialization error:', error);
      throw error;
    }
    return;
  }

  // Cloud mode: PostgreSQL initialization
  try {
    // Enable pgvector extension (required for vector similarity search)
    try {
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
      console.log('[db] pgvector extension enabled');
    } catch (extError) {
      console.warn('[db] pgvector extension not available — vector features will be disabled. Error:', (extError as Error).message);
    }

    // Create all required tables if they don't exist
    await createTablesIfNotExist();

    // Check if embedding column needs migration from text to vector (only if pgvector available)
    try {
      const result = await db.execute(sql`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = 'ai_document_chunks'
          AND column_name = 'embedding'
      `);

      const columnInfo = result.rows[0] as { data_type: string } | undefined;

      if (columnInfo) {
        if (columnInfo.data_type === 'text') {
          console.log('[db] Embedding column is TEXT type — vector migration skipped (pgvector may not be available)');
        } else {
          console.log('[db] Embedding column already using vector type');
        }
      }
    } catch {
      console.log('[db] Embedding column check skipped');
    }

    // Create index for vector similarity search (if not exists)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
      ON ai_document_chunks
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `).catch(() => {
      console.log('[db] IVFFlat index skipped (pgvector not available or requires data)');
    });

    console.log('[db] Database initialization complete');
  } catch (error) {
    console.error('[db] Database initialization error:', error);
    throw error;
  }
}
