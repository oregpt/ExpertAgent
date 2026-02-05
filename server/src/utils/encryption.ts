/**
 * Encryption Utilities
 *
 * Shared AES-256-GCM encryption/decryption used for:
 * - Capability tokens
 * - Agent API keys
 * - Channel config secrets (Slack bot tokens, Teams credentials, etc.)
 *
 * Uses the CAPABILITY_ENCRYPTION_KEY env var (same key for all secrets).
 */

import crypto from 'crypto';

// Encryption key from environment (32 bytes for AES-256)
const ENCRYPTION_KEY = process.env.CAPABILITY_ENCRYPTION_KEY || 'default-32-byte-key-for-dev-only!';

/**
 * Encrypt a value using AES-256-GCM
 */
export function encrypt(text: string): { encrypted: string; iv: string } {
  const iv = crypto.randomBytes(12);
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32), 'utf8');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Combine encrypted data with auth tag
  return {
    encrypted: encrypted + ':' + authTag.toString('hex'),
    iv: iv.toString('hex'),
  };
}

/**
 * Decrypt a value using AES-256-GCM
 */
export function decrypt(encryptedData: string, ivHex: string): string {
  const parts = encryptedData.split(':');
  const encrypted = parts[0] || '';
  const authTagHex = parts[1] || '';
  if (!authTagHex || !ivHex || !encrypted) throw new Error('Invalid encrypted data');

  const authTag = Buffer.from(authTagHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32), 'utf8');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted: string = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ============================================================================
// Channel Config Encryption Helpers
// ============================================================================

/**
 * Keys in channel configs that contain secrets and must be encrypted.
 * Covers all known channel types (Slack, Teams, Webhook).
 */
const SENSITIVE_CONFIG_KEYS = new Set([
  // Slack
  'bot_token',
  'signing_secret',
  'app_token',
  // Teams
  'app_password',
  'client_secret',
  // Webhook
  'secret',
  'auth_token',
  // Generic
  'access_token',
  'api_key',
  'api_secret',
  'token',
  'password',
]);

/** Prefix for encrypted values so we can distinguish them from plaintext */
const ENCRYPTED_PREFIX = 'enc:';

/**
 * Encrypt sensitive fields in a channel config object.
 * Non-sensitive fields are left as-is.
 * Already-encrypted fields (prefixed with "enc:") are skipped.
 *
 * Returns a new config object with sensitive values encrypted + an __iv field.
 */
export function encryptChannelConfig(config: Record<string, any>): Record<string, any> {
  if (!config || typeof config !== 'object') return config;

  const result: Record<string, any> = {};
  let iv: string | null = null;

  for (const [key, value] of Object.entries(config)) {
    if (key === '__iv') continue; // Skip metadata key

    if (SENSITIVE_CONFIG_KEYS.has(key) && typeof value === 'string' && value.length > 0) {
      // Skip if already encrypted
      if (value.startsWith(ENCRYPTED_PREFIX)) {
        result[key] = value;
        continue;
      }
      const encrypted = encrypt(value);
      result[key] = ENCRYPTED_PREFIX + encrypted.encrypted;
      iv = encrypted.iv; // Use the last IV (each encrypt generates its own, but we store one per config)
    } else {
      result[key] = value;
    }
  }

  // Store IV for decryption (only if we encrypted anything)
  if (iv) {
    result.__iv = iv;
  } else if (config.__iv) {
    result.__iv = config.__iv; // Preserve existing IV if nothing new was encrypted
  }

  return result;
}

/**
 * Decrypt sensitive fields in a channel config object.
 * Returns a new config object with sensitive values decrypted.
 * Non-encrypted fields are left as-is.
 */
export function decryptChannelConfig(config: Record<string, any>): Record<string, any> {
  if (!config || typeof config !== 'object') return config;

  const iv = config.__iv;
  if (!iv) return config; // No IV = nothing was encrypted

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(config)) {
    if (key === '__iv') continue; // Strip metadata from decrypted output

    if (SENSITIVE_CONFIG_KEYS.has(key) && typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX)) {
      try {
        const encryptedData = value.slice(ENCRYPTED_PREFIX.length);
        result[key] = decrypt(encryptedData, iv);
      } catch {
        // If decryption fails, keep the encrypted value (don't crash)
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Mask sensitive fields in a channel config for API responses.
 * Replaces secret values with "••••configured" to indicate they exist
 * without exposing the actual values.
 */
export function maskChannelConfig(config: Record<string, any>): Record<string, any> {
  if (!config || typeof config !== 'object') return config;

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(config)) {
    if (key === '__iv') continue; // Strip internal metadata

    if (SENSITIVE_CONFIG_KEYS.has(key) && typeof value === 'string' && value.length > 0) {
      result[key] = '••••configured';
    } else {
      result[key] = value;
    }
  }

  return result;
}
