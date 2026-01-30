-- Migration 002: Agent Memory Embeddings table
-- Stores chunked embeddings for semantic search across agent documents

CREATE TABLE IF NOT EXISTS ai_agent_memory_embeddings (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(64) NOT NULL,
  doc_id INTEGER NOT NULL REFERENCES ai_agent_documents(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),                  -- OpenAI text-embedding-3-small dimension
  line_start INTEGER,
  line_end INTEGER,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Index for filtering by agent
CREATE INDEX IF NOT EXISTS idx_agent_memory_embeddings_agent
  ON ai_agent_memory_embeddings(agent_id);

-- Index for filtering by document
CREATE INDEX IF NOT EXISTS idx_agent_memory_embeddings_doc
  ON ai_agent_memory_embeddings(doc_id);

-- Vector similarity index (HNSW is more reliable than IVFFlat for small datasets)
CREATE INDEX IF NOT EXISTS idx_agent_memory_embeddings_vector
  ON ai_agent_memory_embeddings
  USING hnsw (embedding vector_cosine_ops);
