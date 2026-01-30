-- Migration 003: Agent Cron Jobs
-- Phase 3: Proactive Engine — scheduled tasks for agents

CREATE TABLE IF NOT EXISTS ai_agent_cron_jobs (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(64) NOT NULL,
  schedule VARCHAR(100) NOT NULL,       -- cron expression like '0 9 * * 1' OR interval like 'every 30m'
  task_text TEXT NOT NULL,               -- what the agent should do
  model VARCHAR(100),                    -- optional model override
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cron_agent ON ai_agent_cron_jobs(agent_id);
CREATE INDEX IF NOT EXISTS idx_cron_next_run ON ai_agent_cron_jobs(next_run_at) WHERE enabled = true;
