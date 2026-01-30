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
