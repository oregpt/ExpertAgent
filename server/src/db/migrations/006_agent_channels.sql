-- Migration 006: Agent Channels (Multi-Channel Delivery)
-- Phase 4: Slack, Teams, Webhook integrations

CREATE TABLE IF NOT EXISTS ai_agent_channels (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(64) NOT NULL,
  channel_type VARCHAR(50) NOT NULL,       -- 'slack', 'teams', 'webhook'
  channel_name VARCHAR(100),                -- friendly display name
  config JSONB NOT NULL DEFAULT '{}',       -- channel-specific config (tokens, URLs, secrets)
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_agent ON ai_agent_channels(agent_id);
CREATE INDEX IF NOT EXISTS idx_channels_type ON ai_agent_channels(channel_type);
