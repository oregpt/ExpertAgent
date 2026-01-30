-- Migration 005: Agent Task Runs
-- Phase 3: Proactive Engine — execution audit log for heartbeats, cron, background tasks

CREATE TABLE IF NOT EXISTS ai_agent_task_runs (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(64) NOT NULL,
  run_type VARCHAR(20) NOT NULL,        -- 'heartbeat', 'cron', 'background'
  source_id INT,                         -- cron job id if applicable
  task_text TEXT,
  status VARCHAR(20) DEFAULT 'running',  -- 'running', 'completed', 'failed'
  result TEXT,                            -- agent's response
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_task_runs_agent ON ai_agent_task_runs(agent_id);
