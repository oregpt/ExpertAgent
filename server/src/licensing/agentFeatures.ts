/**
 * Per-Agent Feature Resolution
 *
 * Resolves the effective feature flags for a specific agent by combining:
 * 1. Global features (from license key or env vars) — the ceiling
 * 2. Agent-level overrides (from the `features` JSONB column) — can only disable, never exceed global
 *
 * Design principles:
 * - Global flags are the ceiling. Per-agent can disable but not exceed.
 * - Default for new agents: all v2 features ON (matching global flags).
 * - Backward compatible: agents without features column get global defaults.
 * - Non-v2 features (multiAgent, mcpHub, etc.) are always global — not per-agent.
 */

import { FeatureFlags, getFeatures } from './features';
import { db } from '../db/client';
import { agents } from '../db/schema';
import { eq } from 'drizzle-orm';

// ============================================================================
// Types
// ============================================================================

/** The v2 features that can be toggled per-agent */
export interface AgentFeatureOverrides {
  soulMemory?: boolean;
  deepTools?: boolean;
  proactive?: boolean;
  backgroundAgents?: boolean;
  multiChannel?: boolean;
}

/** V2 feature keys that are per-agent configurable */
export const V2_FEATURE_KEYS: (keyof AgentFeatureOverrides)[] = [
  'soulMemory',
  'deepTools',
  'proactive',
  'backgroundAgents',
  'multiChannel',
];

// ============================================================================
// Agent Loader (lightweight — just loads features column)
// ============================================================================

// Simple cache to avoid hitting DB on every feature check
const agentFeaturesCache = new Map<string, { data: AgentFeatureOverrides; expiry: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Load agent feature overrides from DB.
 * Returns empty object if agent not found or no overrides set.
 */
async function loadAgentOverrides(agentId: string): Promise<AgentFeatureOverrides> {
  // Check cache
  const cached = agentFeaturesCache.get(agentId);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  try {
    const rows = await db
      .select({ features: agents.features })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1) as any[];

    const overrides: AgentFeatureOverrides = (rows[0]?.features as AgentFeatureOverrides) || {};

    agentFeaturesCache.set(agentId, { data: overrides, expiry: Date.now() + CACHE_TTL_MS });
    return overrides;
  } catch (err) {
    console.warn(`[agentFeatures] Failed to load overrides for agent ${agentId}:`, err);
    return {};
  }
}

/**
 * Invalidate the cache for an agent (call after updating features).
 */
export function invalidateAgentFeaturesCache(agentId: string): void {
  agentFeaturesCache.delete(agentId);
}

// ============================================================================
// Main Resolution Function
// ============================================================================

/**
 * Resolve the effective feature flags for a specific agent.
 *
 * Logic: effective = global AND agent_override (if agent has a setting)
 * - If global is OFF → always OFF (can't exceed global)
 * - If global is ON and agent override is undefined → ON (default = enabled)
 * - If global is ON and agent override is false → OFF (agent disabled it)
 * - If global is ON and agent override is true → ON
 */
export async function getAgentFeatures(agentId: string): Promise<FeatureFlags> {
  const globalFeatures = getFeatures();
  const agentOverrides = await loadAgentOverrides(agentId);

  return {
    // Non-v2 features: always use global (not per-agent configurable)
    multiAgent: globalFeatures.multiAgent,
    maxAgents: globalFeatures.maxAgents,
    multimodal: globalFeatures.multimodal,
    mcpHub: globalFeatures.mcpHub,
    allowedCapabilities: globalFeatures.allowedCapabilities,
    customBranding: globalFeatures.customBranding,
    gitlabKbSync: globalFeatures.gitlabKbSync,

    // v2 features: global AND agent override
    soulMemory: globalFeatures.soulMemory && (agentOverrides.soulMemory !== false),
    deepTools: globalFeatures.deepTools && (agentOverrides.deepTools !== false),
    proactive: globalFeatures.proactive && (agentOverrides.proactive !== false),
    backgroundAgents: globalFeatures.backgroundAgents && (agentOverrides.backgroundAgents !== false),
    multiChannel: globalFeatures.multiChannel && (agentOverrides.multiChannel !== false),
  };
}

/**
 * Get effective features for an agent, including metadata about what's global vs agent.
 * Used by the admin UI to show which toggles are available.
 */
export async function getAgentFeaturesDetailed(agentId: string): Promise<{
  effective: FeatureFlags;
  global: Pick<FeatureFlags, 'soulMemory' | 'deepTools' | 'proactive' | 'backgroundAgents' | 'multiChannel'>;
  agentOverrides: AgentFeatureOverrides;
}> {
  const globalFeatures = getFeatures();
  const agentOverrides = await loadAgentOverrides(agentId);
  const effective = await getAgentFeatures(agentId);

  return {
    effective,
    global: {
      soulMemory: globalFeatures.soulMemory,
      deepTools: globalFeatures.deepTools,
      proactive: globalFeatures.proactive,
      backgroundAgents: globalFeatures.backgroundAgents,
      multiChannel: globalFeatures.multiChannel,
    },
    agentOverrides,
  };
}
