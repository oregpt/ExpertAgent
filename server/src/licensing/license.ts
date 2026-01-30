/**
 * License Key System
 *
 * License keys are signed JWTs containing feature flags.
 * Only AgenticLedger can generate valid keys (using the secret).
 * Customers cannot forge or modify keys without invalidating the signature.
 */

import jwt from 'jsonwebtoken';
import { FeatureFlags, BASE_FEATURES } from './features';

/**
 * The secret key used to sign/verify license keys.
 * This should be a strong, random string.
 *
 * For GENERATING keys: Set LICENSE_SECRET env var (only on your machine)
 * For VERIFYING keys: The same secret must be compiled in or available
 */
const LICENSE_SECRET = process.env.LICENSE_SECRET || 'agenticledger-default-secret-change-in-production';

// ============================================================================
// Tier Presets
// ============================================================================

/**
 * License tier presets.
 *
 * Each tier defines the full set of feature flags for a license level:
 * - starter: v1 equivalent — widget + RAG + basic MCP tools
 * - pro:     + soul/memory, deep tools, multi-channel, custom branding
 * - enterprise: everything unlocked, max scale
 */
export type LicenseTier = 'starter' | 'pro' | 'enterprise';

export const TIER_PRESETS: Record<LicenseTier, FeatureFlags> = {
  starter: {
    // v1 equivalent — widget + RAG + basic tools
    multiAgent: false,
    maxAgents: 1,
    multimodal: true,
    mcpHub: true,
    allowedCapabilities: ['*'],
    customBranding: false,
    gitlabKbSync: false,
    soulMemory: false,
    deepTools: false,
    proactive: false,
    backgroundAgents: false,
    multiChannel: false,
  },
  pro: {
    // v1 + soul/memory + deep tools + multi-channel + branding
    multiAgent: true,
    maxAgents: 5,
    multimodal: true,
    mcpHub: true,
    allowedCapabilities: ['*'],
    customBranding: true,
    gitlabKbSync: true,
    soulMemory: true,
    deepTools: true,
    proactive: false,       // not in Pro
    backgroundAgents: false, // not in Pro
    multiChannel: true,
  },
  enterprise: {
    // Everything unlocked
    multiAgent: true,
    maxAgents: 100,
    multimodal: true,
    mcpHub: true,
    allowedCapabilities: ['*'],
    customBranding: true,
    gitlabKbSync: true,
    soulMemory: true,
    deepTools: true,
    proactive: true,
    backgroundAgents: true,
    multiChannel: true,
  },
};

/**
 * License payload structure (what's encoded in the JWT)
 */
export interface LicensePayload {
  // Organization identifier
  org: string;

  // Human-readable license name
  name?: string;

  // Feature flags
  features: FeatureFlags;

  // License metadata
  issuedAt?: number;
  expiresAt?: number;
}

/**
 * Result of license validation
 */
export interface LicenseValidationResult {
  valid: boolean;
  features: FeatureFlags;
  org?: string;
  name?: string;
  expiresAt?: Date;
  error?: string;
}

/**
 * Validate and decode a license key
 */
export function validateLicenseKey(licenseKey: string): LicenseValidationResult {
  if (!licenseKey || licenseKey.trim() === '') {
    return {
      valid: false,
      features: BASE_FEATURES,
      error: 'No license key provided',
    };
  }

  try {
    // Verify signature and decode
    const decoded = jwt.verify(licenseKey.trim(), LICENSE_SECRET) as LicensePayload & { exp?: number; iat?: number };

    // Validate required fields
    if (!decoded.features) {
      return {
        valid: false,
        features: BASE_FEATURES,
        error: 'Invalid license: missing features',
      };
    }

    // Build the features object with defaults for any missing fields
    const features: FeatureFlags = {
      multiAgent: decoded.features.multiAgent ?? BASE_FEATURES.multiAgent,
      maxAgents: decoded.features.maxAgents ?? BASE_FEATURES.maxAgents,
      multimodal: decoded.features.multimodal ?? BASE_FEATURES.multimodal,
      mcpHub: decoded.features.mcpHub ?? BASE_FEATURES.mcpHub,
      allowedCapabilities: decoded.features.allowedCapabilities ?? BASE_FEATURES.allowedCapabilities,
      customBranding: decoded.features.customBranding ?? BASE_FEATURES.customBranding,
      gitlabKbSync: decoded.features.gitlabKbSync ?? BASE_FEATURES.gitlabKbSync,
      soulMemory: decoded.features.soulMemory ?? BASE_FEATURES.soulMemory,
      deepTools: decoded.features.deepTools ?? BASE_FEATURES.deepTools,
      proactive: decoded.features.proactive ?? BASE_FEATURES.proactive,
      backgroundAgents: decoded.features.backgroundAgents ?? BASE_FEATURES.backgroundAgents,
      multiChannel: decoded.features.multiChannel ?? BASE_FEATURES.multiChannel,
    };

    const result: LicenseValidationResult = {
      valid: true,
      features,
    };

    if (decoded.org) result.org = decoded.org;
    if (decoded.name) result.name = decoded.name;
    if (decoded.exp) result.expiresAt = new Date(decoded.exp * 1000);

    return result;
  } catch (err) {
    const error = err as Error;

    if (error.name === 'TokenExpiredError') {
      return {
        valid: false,
        features: BASE_FEATURES,
        error: 'License key has expired',
      };
    }

    if (error.name === 'JsonWebTokenError') {
      return {
        valid: false,
        features: BASE_FEATURES,
        error: 'Invalid license key signature',
      };
    }

    return {
      valid: false,
      features: BASE_FEATURES,
      error: `License validation failed: ${error.message}`,
    };
  }
}

/**
 * Generate a license key (only for use in generate-license script)
 */
export function generateLicenseKey(payload: LicensePayload, expiresIn?: string): string {
  const secret = process.env.LICENSE_SECRET;

  if (!secret || secret === 'agenticledger-default-secret-change-in-production') {
    throw new Error('LICENSE_SECRET must be set to generate license keys');
  }

  const options: jwt.SignOptions = expiresIn
    ? { expiresIn } as jwt.SignOptions
    : {};

  return jwt.sign(
    {
      org: payload.org,
      name: payload.name,
      features: payload.features,
      issuedAt: Date.now(),
    },
    secret,
    options
  );
}

/**
 * Generate a license key from a tier preset.
 * Convenience wrapper around generateLicenseKey.
 */
export function generateLicenseForTier(
  org: string,
  tier: LicenseTier,
  options?: { name?: string; expiresIn?: string }
): string {
  return generateLicenseKey(
    {
      org,
      name: options?.name || `${org} — ${tier}`,
      features: { ...TIER_PRESETS[tier] },
    },
    options?.expiresIn
  );
}

/**
 * Build a FeatureFlags object from a comma-separated list of flag names.
 * Starts from BASE_FEATURES and enables each named flag.
 *
 * @param flagNames — e.g. ['soulMemory', 'deepTools', 'multiChannel']
 */
export function buildCustomFeatures(flagNames: string[]): FeatureFlags {
  const features: FeatureFlags = { ...BASE_FEATURES };

  for (const flag of flagNames) {
    const trimmed = flag.trim();
    if (trimmed in features) {
      (features as any)[trimmed] = true;
    }
  }

  // If multiAgent is enabled but maxAgents is still 1, bump it
  if (features.multiAgent && features.maxAgents <= 1) {
    features.maxAgents = 10;
  }

  return features;
}

/**
 * Decode a license key without verification (for debugging)
 */
export function decodeLicenseKey(licenseKey: string): LicensePayload | null {
  try {
    const decoded = jwt.decode(licenseKey.trim()) as LicensePayload | null;
    return decoded;
  } catch {
    return null;
  }
}
