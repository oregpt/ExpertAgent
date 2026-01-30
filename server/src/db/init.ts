import { db } from './client';
import { sql } from 'drizzle-orm';

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

  // Document chunks table (with pgvector)
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

  console.log('[db] All tables created/verified');
}

/**
 * Initialize database with required extensions and schema updates
 */
export async function initializeDatabase(): Promise<void> {
  try {
    // Enable pgvector extension (required for vector similarity search)
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    console.log('[db] pgvector extension enabled');

    // Create all required tables if they don't exist
    await createTablesIfNotExist();

    // Check if embedding column needs migration from text to vector
    const result = await db.execute(sql`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_name = 'ai_document_chunks'
        AND column_name = 'embedding'
    `);

    const columnInfo = result.rows[0] as { data_type: string } | undefined;

    if (columnInfo) {
      if (columnInfo.data_type === 'text') {
        console.log('[db] Migrating embedding column from text to vector...');

        // Add temporary vector column
        await db.execute(sql`
          ALTER TABLE ai_document_chunks
          ADD COLUMN IF NOT EXISTS embedding_new vector(1536)
        `);

        // Migrate existing text embeddings to vector format
        // This will only work if the text is valid JSON array format
        await db.execute(sql`
          UPDATE ai_document_chunks
          SET embedding_new = embedding::vector
          WHERE embedding IS NOT NULL
            AND embedding != ''
            AND embedding_new IS NULL
        `);

        // Drop old column and rename new one
        await db.execute(sql`ALTER TABLE ai_document_chunks DROP COLUMN IF EXISTS embedding`);
        await db.execute(sql`ALTER TABLE ai_document_chunks RENAME COLUMN embedding_new TO embedding`);

        console.log('[db] Embedding column migrated to vector type');
      } else {
        console.log('[db] Embedding column already using vector type');
      }
    } else {
      console.log('[db] ai_document_chunks table does not exist yet - will be created by Drizzle');
    }

    // Create index for vector similarity search (if not exists)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
      ON ai_document_chunks
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `).catch(() => {
      // IVFFlat requires at least some data to build, use HNSW as fallback
      console.log('[db] IVFFlat index skipped (requires data), will use HNSW');
    });

    console.log('[db] Database initialization complete');
  } catch (error) {
    console.error('[db] Database initialization error:', error);
    throw error;
  }
}
