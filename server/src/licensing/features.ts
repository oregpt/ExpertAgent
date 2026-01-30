/**
 * Feature Flags System
 *
 * This is the core layer that all feature checks go through.
 * The flags can be populated from:
 * 1. License key (signed JWT) - for self-hosted customers
 * 2. Environment variables - for development/testing
 * 3. Base features (fallback) - minimal free tier
 */

export interface FeatureFlags {
  // Multi-agent support
  multiAgent: boolean;
  maxAgents: number;

  // Multimodal (file attachments, images, etc.)
  multimodal: boolean;

  // MCP Hub / Capabilities system
  mcpHub: boolean;

  // Specific capabilities allowed (empty array = none, ['*'] = all)
  allowedCapabilities: string[];

  // Custom branding (if false, forces "Powered by AgenticLedger")
  customBranding: boolean;

  // GitLab KB Sync (pull docs from GitLab to Knowledge Base)
  gitlabKbSync: boolean;
}

/**
 * Base features - the free/minimal tier
 * This is what you get with no license key and no env vars
 */
export const BASE_FEATURES: FeatureFlags = {
  multiAgent: false,
  maxAgents: 1,
  multimodal: false,
  mcpHub: false,
  allowedCapabilities: [],
  customBranding: false,
  gitlabKbSync: false,
};

/**
 * Full features - everything unlocked
 * Used for generating "enterprise" license keys
 */
export const FULL_FEATURES: FeatureFlags = {
  multiAgent: true,
  maxAgents: 999,
  multimodal: true,
  mcpHub: true,
  allowedCapabilities: ['*'], // Wildcard = all capabilities
  customBranding: true,
  gitlabKbSync: true,
};

// Current features (set on startup)
let currentFeatures: FeatureFlags = { ...BASE_FEATURES };

/**
 * Get the current feature flags
 */
export function getFeatures(): FeatureFlags {
  return currentFeatures;
}

/**
 * Set the current feature flags (called on startup)
 */
export function setFeatures(features: FeatureFlags): void {
  currentFeatures = { ...features };
  console.log('[licensing] Features loaded:', summarizeFeatures(currentFeatures));
}

/**
 * Check if a specific capability is allowed
 */
export function isCapabilityAllowed(capabilityId: string): boolean {
  const features = getFeatures();

  // MCP Hub must be enabled first
  if (!features.mcpHub) {
    return false;
  }

  // Check if wildcard (all allowed)
  if (features.allowedCapabilities.includes('*')) {
    return true;
  }

  // Check specific capability
  return features.allowedCapabilities.includes(capabilityId);
}

/**
 * Check if we can create more agents
 */
export function canCreateAgent(currentAgentCount: number): boolean {
  const features = getFeatures();

  if (!features.multiAgent && currentAgentCount >= 1) {
    return false;
  }

  return currentAgentCount < features.maxAgents;
}

/**
 * Human-readable summary of features for logging
 */
function summarizeFeatures(f: FeatureFlags): string {
  const parts: string[] = [];

  if (f.multiAgent) parts.push(`multiAgent(max:${f.maxAgents})`);
  if (f.multimodal) parts.push('multimodal');
  if (f.mcpHub) {
    const caps = f.allowedCapabilities.includes('*')
      ? 'all'
      : f.allowedCapabilities.length > 0
        ? f.allowedCapabilities.join(',')
        : 'none';
    parts.push(`mcpHub(caps:${caps})`);
  }
  if (f.customBranding) parts.push('customBranding');
  if (f.gitlabKbSync) parts.push('gitlabKbSync');

  return parts.length > 0 ? parts.join(', ') : 'BASE (no features)';
}
