-- Phase 5: Session Continuity — Enhance conversations table with session metadata
-- Adds channel tracking, session summaries, and activity counters

ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS channel_type VARCHAR(50);
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS channel_id VARCHAR(255);
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS session_summary TEXT;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS message_count INT DEFAULT 0;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

-- Indexes for session queries
CREATE INDEX IF NOT EXISTS idx_conversations_agent_channel
  ON ai_conversations(agent_id, channel_type, channel_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message
  ON ai_conversations(agent_id, last_message_at DESC);
