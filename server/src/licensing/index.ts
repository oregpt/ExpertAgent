/**
 * Licensing System - Main Entry Point
 *
 * Initializes feature flags on startup from:
 * 1. License key (AGENTICLEDGER_LICENSE_KEY) - highest priority
 * 2. Environment variables (FEATURE_*) - ONLY in development mode
 * 3. Base features (fallback)
 *
 * IMPORTANT: In production (NODE_ENV=production), env var overrides are DISABLED.
 * This prevents customers from bypassing licensing by setting FEATURE_* vars.
 * They must have a valid license key to unlock features.
 */

import { FeatureFlags, BASE_FEATURES, setFeatures, getFeatures, isCapabilityAllowed, canCreateAgent } from './features';
import { validateLicenseKey } from './license';

// Re-export for convenience
export { getFeatures, isCapabilityAllowed, canCreateAgent } from './features';
export type { FeatureFlags } from './features';

/**
 * Parse boolean from env var (handles various formats)
 */
function parseBoolEnv(value: string | undefined): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  const lower = value.toLowerCase().trim();
  if (lower === 'true' || lower === '1' || lower === 'yes') return true;
  if (lower === 'false' || lower === '0' || lower === 'no') return false;
  return undefined;
}

/**
 * Parse number from env var
 */
function parseNumberEnv(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const num = parseInt(value, 10);
  return isNaN(num) ? undefined : num;
}

/**
 * Parse comma-separated list from env var
 */
function parseListEnv(value: string | undefined): string[] | undefined {
  if (value === undefined || value === '') return undefined;
  return value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Load features from environment variables
 */
function loadFeaturesFromEnv(): Partial<FeatureFlags> {
  const features: Partial<FeatureFlags> = {};

  const multiAgent = parseBoolEnv(process.env.FEATURE_MULTI_AGENT);
  if (multiAgent !== undefined) features.multiAgent = multiAgent;

  const maxAgents = parseNumberEnv(process.env.FEATURE_MAX_AGENTS);
  if (maxAgents !== undefined) features.maxAgents = maxAgents;

  const multimodal = parseBoolEnv(process.env.FEATURE_MULTIMODAL);
  if (multimodal !== undefined) features.multimodal = multimodal;

  const mcpHub = parseBoolEnv(process.env.FEATURE_MCP_HUB);
  if (mcpHub !== undefined) features.mcpHub = mcpHub;

  const capabilities = parseListEnv(process.env.FEATURE_CAPABILITIES);
  if (capabilities !== undefined) features.allowedCapabilities = capabilities;

  const customBranding = parseBoolEnv(process.env.FEATURE_CUSTOM_BRANDING);
  if (customBranding !== undefined) features.customBranding = customBranding;

  const gitlabKbSync = parseBoolEnv(process.env.FEATURE_GITLAB_KB_SYNC);
  if (gitlabKbSync !== undefined) features.gitlabKbSync = gitlabKbSync;

  return features;
}

/**
 * Initialize the licensing system
 * Call this once on startup, before handling any requests
 */
export function initializeLicensing(): void {
  console.log('[licensing] Initializing...');

  // Priority 1: Check for license key
  const licenseKey = process.env.AGENTICLEDGER_LICENSE_KEY;

  if (licenseKey) {
    console.log('[licensing] Found license key, validating...');
    const result = validateLicenseKey(licenseKey);

    if (result.valid) {
      console.log(`[licensing] License valid for: ${result.org || 'unknown org'}`);
      if (result.expiresAt) {
        console.log(`[licensing] License expires: ${result.expiresAt.toISOString()}`);
      }
      setFeatures(result.features);
      return;
    } else {
      console.warn(`[licensing] License validation failed: ${result.error}`);
      console.warn('[licensing] Falling back to env vars or base features');
    }
  }

  // Priority 2: Check for env var overrides (ONLY in development mode)
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const envFeatures = loadFeaturesFromEnv();
    const hasEnvOverrides = Object.keys(envFeatures).length > 0;

    if (hasEnvOverrides) {
      console.log('[licensing] Using environment variable overrides (dev mode)');
      // Merge with base features
      const mergedFeatures: FeatureFlags = {
        ...BASE_FEATURES,
        ...envFeatures,
      };
      setFeatures(mergedFeatures);
      return;
    }
  } else {
    console.log('[licensing] Production mode - env var overrides disabled');
  }

  // Priority 3: Use base features
  console.log('[licensing] Using base features (license key required for more)');
  setFeatures(BASE_FEATURES);
}

/**
 * Get a summary of current licensing status (for admin UI)
 */
export function getLicensingStatus(): {
  mode: 'license' | 'env' | 'base';
  org?: string;
  expiresAt?: string;
  features: FeatureFlags;
} {
  const features = getFeatures();
  const licenseKey = process.env.AGENTICLEDGER_LICENSE_KEY;

  if (licenseKey) {
    const result = validateLicenseKey(licenseKey);
    if (result.valid) {
      const status: {
        mode: 'license' | 'env' | 'base';
        org?: string;
        expiresAt?: string;
        features: FeatureFlags;
      } = {
        mode: 'license',
        features,
      };
      if (result.org) status.org = result.org;
      if (result.expiresAt) status.expiresAt = result.expiresAt.toISOString();
      return status;
    }
  }

  // Only report env mode if not in production
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const envFeatures = loadFeaturesFromEnv();
    if (Object.keys(envFeatures).length > 0) {
      return {
        mode: 'env',
        features,
      };
    }
  }

  return {
    mode: 'base',
    features,
  };
}
