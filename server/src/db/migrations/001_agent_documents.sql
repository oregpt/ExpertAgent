-- Migration 001: Agent Documents table
-- Stores soul.md, memory.md, context.md, daily/*.md per agent

CREATE TABLE IF NOT EXISTS ai_agent_documents (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(64) NOT NULL,
  doc_type VARCHAR(50) NOT NULL,           -- 'soul', 'memory', 'context', 'daily'
  doc_key VARCHAR(255) NOT NULL,           -- e.g., 'soul.md', 'daily/2026-01-30.md'
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_agent_documents_agent_type
  ON ai_agent_documents(agent_id, doc_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_documents_agent_key
  ON ai_agent_documents(agent_id, doc_key);
