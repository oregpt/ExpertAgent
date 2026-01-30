-- Migration 004: Agent Heartbeat Config
-- Phase 3: Proactive Engine — periodic heartbeat configuration per agent

CREATE TABLE IF NOT EXISTS ai_agent_heartbeat_config (
  agent_id VARCHAR(64) PRIMARY KEY,
  enabled BOOLEAN DEFAULT false,
  interval_minutes INT DEFAULT 30,
  checklist TEXT,                        -- markdown checklist for heartbeat
  quiet_hours_start TIME,               -- e.g., '23:00'
  quiet_hours_end TIME,                 -- e.g., '08:00'
  timezone VARCHAR(50) DEFAULT 'UTC',
  last_heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
