-- Migration 008: Per-agent feature overrides
-- Adds a JSONB column to ai_agents for per-agent v2 feature toggles.
-- Stores: { "soulMemory": true, "deepTools": false, ... }
-- Empty object {} means "use global defaults for all features".

ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}';
