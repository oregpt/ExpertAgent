/**
 * Capability Service
 *
 * Manages capabilities and their tokens with AES-256 encryption
 */

import crypto from 'crypto';
import { db } from '../db/client';
import { capabilities, agentCapabilities, capabilityTokens, agentApiKeys } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { Capability } from '../mcp-hub/types';
import { dbNow } from '../db/date-utils';

// Encryption key from environment (32 bytes for AES-256)
const ENCRYPTION_KEY = process.env.CAPABILITY_ENCRYPTION_KEY || 'default-32-byte-key-for-dev-only!';

/**
 * Encrypt a value using AES-256-GCM
 */
function encrypt(text: string): { encrypted: string; iv: string } {
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
function decrypt(encryptedData: string, ivHex: string): string {
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

export class CapabilityService {
  // ============================================================================
  // Capability Registry Operations
  // ============================================================================

  /**
   * Get all capabilities
   */
  async getAllCapabilities(): Promise<Capability[]> {
    const rows = await db.select().from(capabilities);
    return rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      type: row.type as 'mcp' | 'anyapi',
      category: row.category,
      config: row.config,
      enabled: row.enabled === 1,
    }));
  }

  /**
   * Get a capability by ID
   */
  async getCapability(id: string): Promise<Capability | null> {
    const rows = await db.select().from(capabilities).where(eq(capabilities.id, id));
    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      type: row.type as 'mcp' | 'anyapi',
      category: row.category ?? null,
      config: row.config,
      enabled: row.enabled === 1,
    };
  }

  /**
   * Create or update a capability
   */
  async upsertCapability(capability: Capability): Promise<void> {
    const existing = await this.getCapability(capability.id);

    if (existing) {
      await db
        .update(capabilities)
        .set({
          name: capability.name,
          description: capability.description,
          type: capability.type,
          category: capability.category,
          config: capability.config,
          enabled: capability.enabled ? 1 : 0,
        })
        .where(eq(capabilities.id, capability.id));
    } else {
      await db.insert(capabilities).values({
        id: capability.id,
        name: capability.name,
        description: capability.description,
        type: capability.type,
        category: capability.category,
        config: capability.config,
        enabled: capability.enabled ? 1 : 0,
      });
    }
  }

  /**
   * Delete a capability
   */
  async deleteCapability(id: string): Promise<void> {
    await db.delete(capabilities).where(eq(capabilities.id, id));
    // Also delete related agent capabilities and tokens
    await db.delete(agentCapabilities).where(eq(agentCapabilities.capabilityId, id));
    await db.delete(capabilityTokens).where(eq(capabilityTokens.capabilityId, id));
  }

  // ============================================================================
  // Agent Capability Operations
  // ============================================================================

  /**
   * Get all capabilities for an agent
   */
  async getAgentCapabilities(agentId: string): Promise<(Capability & { agentEnabled: boolean })[]> {
    // Get all capabilities
    const allCapabilities = await this.getAllCapabilities();

    // Get agent's enabled capabilities
    const agentCaps = await db
      .select()
      .from(agentCapabilities)
      .where(eq(agentCapabilities.agentId, agentId));

    const agentCapMap = new Map(agentCaps.map((ac: any) => [ac.capabilityId, ac.enabled === 1]));

    return allCapabilities.map((cap) => ({
      ...cap,
      agentEnabled: agentCapMap.get(cap.id) === true,
    }));
  }

  /**
   * Enable/disable a capability for an agent
   */
  async setAgentCapability(agentId: string, capabilityId: string, enabled: boolean): Promise<void> {
    const existing = await db
      .select()
      .from(agentCapabilities)
      .where(and(eq(agentCapabilities.agentId, agentId), eq(agentCapabilities.capabilityId, capabilityId)));

    if (existing.length > 0) {
      await db
        .update(agentCapabilities)
        .set({ enabled: enabled ? 1 : 0, updatedAt: dbNow() })
        .where(and(eq(agentCapabilities.agentId, agentId), eq(agentCapabilities.capabilityId, capabilityId)));
    } else {
      await db.insert(agentCapabilities).values({
        agentId,
        capabilityId,
        enabled: enabled ? 1 : 0,
      });
    }
  }

  // ============================================================================
  // Token Operations (Encrypted)
  // ============================================================================

  /**
   * Set tokens for a capability (encrypted)
   */
  async setCapabilityTokens(
    agentId: string,
    capabilityId: string,
    tokens: {
      token1?: string | undefined;
      token2?: string | undefined;
      token3?: string | undefined;
      token4?: string | undefined;
      token5?: string | undefined;
    },
    expiresAt?: Date | undefined
  ): Promise<void> {
    // Encrypt each token with its own embedded IV
    // Format: "iv_hex:ciphertext_hex:authTag_hex" per token value
    // The row-level `iv` column is set to "embedded" as a flag for the new format.
    const encryptedTokens: Record<string, string | null> = {};
    const iv = 'embedded';

    for (const [key, value] of Object.entries(tokens)) {
      if (value) {
        const tokenIv = crypto.randomBytes(12);
        const key256 = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32), 'utf8');
        const cipher = crypto.createCipheriv('aes-256-gcm', key256, tokenIv);
        let encrypted = cipher.update(value, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        encryptedTokens[key] = tokenIv.toString('hex') + ':' + encrypted + ':' + authTag.toString('hex');
      } else {
        encryptedTokens[key] = null;
      }
    }

    // Check if tokens already exist
    const existing = await db
      .select()
      .from(capabilityTokens)
      .where(and(eq(capabilityTokens.agentId, agentId), eq(capabilityTokens.capabilityId, capabilityId)));

    if (existing.length > 0) {
      await db
        .update(capabilityTokens)
        .set({
          token1: encryptedTokens.token1,
          token2: encryptedTokens.token2,
          token3: encryptedTokens.token3,
          token4: encryptedTokens.token4,
          token5: encryptedTokens.token5,
          iv,
          expiresAt,
          updatedAt: dbNow(),
        })
        .where(and(eq(capabilityTokens.agentId, agentId), eq(capabilityTokens.capabilityId, capabilityId)));
    } else {
      await db.insert(capabilityTokens).values({
        agentId,
        capabilityId,
        token1: encryptedTokens.token1,
        token2: encryptedTokens.token2,
        token3: encryptedTokens.token3,
        token4: encryptedTokens.token4,
        token5: encryptedTokens.token5,
        iv,
        expiresAt,
      });
    }
  }

  /**
   * Get decrypted tokens for a capability
   */
  async getCapabilityTokens(
    agentId: string,
    capabilityId: string
  ): Promise<{
    token1?: string;
    token2?: string;
    token3?: string;
    token4?: string;
    token5?: string;
    expiresAt?: Date;
  } | null> {
    const rows = await db
      .select()
      .from(capabilityTokens)
      .where(and(eq(capabilityTokens.agentId, agentId), eq(capabilityTokens.capabilityId, capabilityId)));

    const row = rows[0];
    if (!row) return null;

    // Handle encrypted (embedded IV, legacy IV, or unencrypted) tokens
    const decryptedTokens: Record<string, string> = {};
    const isEmbeddedIv = row.iv === 'embedded';
    const useEncryption = !!row.iv;

    for (const key of ['token1', 'token2', 'token3', 'token4', 'token5'] as const) {
      const tokenValue = row[key];
      if (tokenValue) {
        if (isEmbeddedIv) {
          // New format: "iv_hex:ciphertext_hex:authTag_hex" — each token has its own IV
          try {
            const parts = tokenValue.split(':');
            if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
              decryptedTokens[key] = decrypt(parts[1] + ':' + parts[2], parts[0]);
            }
          } catch {
            // Skip failed decryption
          }
        } else if (useEncryption) {
          // Legacy format: single IV in row.iv, token = "ciphertext:authTag"
          try {
            decryptedTokens[key] = decrypt(tokenValue, row.iv!);
          } catch {
            // Skip failed decryption
          }
        } else {
          // Unencrypted token - use as-is
          decryptedTokens[key] = tokenValue;
        }
      }
    }

    // Build result conditionally to satisfy exactOptionalPropertyTypes
    const result: {
      token1?: string;
      token2?: string;
      token3?: string;
      token4?: string;
      token5?: string;
      expiresAt?: Date;
    } = {};

    if (decryptedTokens.token1) result.token1 = decryptedTokens.token1;
    if (decryptedTokens.token2) result.token2 = decryptedTokens.token2;
    if (decryptedTokens.token3) result.token3 = decryptedTokens.token3;
    if (decryptedTokens.token4) result.token4 = decryptedTokens.token4;
    if (decryptedTokens.token5) result.token5 = decryptedTokens.token5;
    if (row.expiresAt) result.expiresAt = row.expiresAt;

    return result;
  }

  /**
   * Check if tokens exist for a capability (without decrypting)
   */
  async hasCapabilityTokens(agentId: string, capabilityId: string): Promise<boolean> {
    const rows = await db
      .select()
      .from(capabilityTokens)
      .where(and(eq(capabilityTokens.agentId, agentId), eq(capabilityTokens.capabilityId, capabilityId)));

    const row = rows[0];
    return row !== undefined && !!row.token1;
  }

  /**
   * Delete tokens for a capability
   */
  async deleteCapabilityTokens(agentId: string, capabilityId: string): Promise<void> {
    await db
      .delete(capabilityTokens)
      .where(and(eq(capabilityTokens.agentId, agentId), eq(capabilityTokens.capabilityId, capabilityId)));
  }

  // ============================================================================
  // Seed Default Capabilities
  // ============================================================================

  /**
   * Seed default capabilities if they don't exist
   */
  async seedDefaultCapabilities(): Promise<void> {
    const defaultCapabilities: Capability[] = [
      {
        id: 'anyapi',
        name: 'AnyAPI (Universal API Caller)',
        description:
          'Universal REST API integration. Call any configured API through natural language. Includes CoinGecko, OpenWeatherMap, REST Countries, and custom APIs.',
        type: 'anyapi',
        category: 'integration',
        enabled: true,
        config: {
          builtInAPIs: ['coingecko', 'openweather', 'jsonplaceholder', 'restcountries'],
        },
      },
      {
        id: 'coingecko',
        name: 'CoinGecko (Crypto Data)',
        description: 'Get cryptocurrency prices, market data, trending coins, and global market stats. No API key required.',
        type: 'anyapi',
        category: 'finance',
        enabled: true,
        config: {
          apiId: 'coingecko',
          requiresAuth: false,
        },
      },
      {
        id: 'openweather',
        name: 'OpenWeatherMap (Weather)',
        description: 'Get current weather and forecasts for any city. Requires free API key from openweathermap.org.',
        type: 'anyapi',
        category: 'data',
        enabled: true,
        config: {
          apiId: 'openweather',
          requiresAuth: true,
          tokenFields: [{ name: 'token1', label: 'API Key', required: true }],
        },
      },
      // MCP Server Capabilities
      {
        id: 'mcp-ccview',
        name: 'CCView (Canton Network Explorer)',
        description: 'Query Canton Network data: validators, governance, rewards, transfers, ANS names via ccview.io API.',
        type: 'mcp',
        category: 'blockchain',
        enabled: true,
        config: {
          serverName: 'ccview',
          requiresAuth: true,
          tokenFields: [{ name: 'token1', label: 'API Key', required: true }],
        },
      },
      {
        id: 'mcp-ccexplorer-pro',
        name: 'CC Explorer Pro (Canton Network)',
        description: 'Advanced Canton Network explorer: contracts, updates, parties, governance, consensus data.',
        type: 'mcp',
        category: 'blockchain',
        enabled: true,
        config: {
          serverName: 'ccexplorer',
          requiresAuth: true,
          tokenFields: [{ name: 'token1', label: 'API Key', required: true }],
        },
      },
      // Finance & Productivity MCP Servers
      {
        id: 'quickbooks',
        name: 'QuickBooks Online',
        description: 'Query and manage QuickBooks Online: customers, invoices, bills, accounts, payments, vendors, items, journal entries, and financial reports.',
        type: 'mcp',
        category: 'finance',
        enabled: true,
        config: {
          serverName: 'quickbooks',
          requiresAuth: true,
          tokenFields: [
            { name: 'token1', label: 'Access Token', required: true },
            { name: 'token2', label: 'Refresh Token', required: true },
            { name: 'token3', label: 'Realm ID (Company ID)', required: true },
            { name: 'token4', label: 'Client ID', required: true },
            { name: 'token5', label: 'Client Secret', required: true },
          ],
        },
      },
      {
        id: 'calendar',
        name: 'Google Calendar',
        description: 'List, create, update, delete, and search calendar events. Supports multiple calendars with OAuth2 auto-refresh.',
        type: 'mcp',
        category: 'productivity',
        enabled: true,
        config: {
          serverName: 'google-calendar',
          requiresAuth: true,
          tokenFields: [
            { name: 'token1', label: 'Access Token', required: true },
            { name: 'token2', label: 'Refresh Token', required: true },
            { name: 'token3', label: 'Client ID', required: true },
            { name: 'token4', label: 'Client Secret', required: true },
          ],
        },
      },
      {
        id: 'slack',
        name: 'Slack',
        description: 'List channels, read/post messages, reply to threads, search messages, manage reactions, and get user info.',
        type: 'mcp',
        category: 'communication',
        enabled: true,
        config: {
          serverName: 'slack',
          requiresAuth: true,
          tokenFields: [{ name: 'token1', label: 'Bot Token (xoxb-...)', required: true }],
        },
      },
      {
        id: 'notion',
        name: 'Notion',
        description: 'Search, read, and manage Notion pages, databases, and blocks. Query databases with filters and sorts.',
        type: 'mcp',
        category: 'productivity',
        enabled: true,
        config: {
          serverName: 'notion',
          requiresAuth: true,
          tokenFields: [{ name: 'token1', label: 'Integration Token', required: true }],
        },
      },
      {
        id: 'email',
        name: 'Gmail',
        description: 'Search, read, send, and reply to emails. Manage labels, threads, and trash. Supports OAuth2 with auto-refresh.',
        type: 'mcp',
        category: 'communication',
        enabled: true,
        config: {
          serverName: 'gmail',
          requiresAuth: true,
          tokenFields: [
            { name: 'token1', label: 'Access Token', required: true },
            { name: 'token2', label: 'Refresh Token', required: true },
            { name: 'token3', label: 'Client ID', required: true },
            { name: 'token4', label: 'Client Secret', required: true },
          ],
        },
      },
      {
        id: 'sheets',
        name: 'Google Sheets',
        description: 'Read/write cell ranges, append rows, create spreadsheets, and list sheets. Supports OAuth2 with auto-refresh.',
        type: 'mcp',
        category: 'productivity',
        enabled: true,
        config: {
          serverName: 'google-sheets',
          requiresAuth: true,
          tokenFields: [
            { name: 'token1', label: 'Access Token', required: true },
            { name: 'token2', label: 'Refresh Token', required: true },
            { name: 'token3', label: 'Client ID', required: true },
            { name: 'token4', label: 'Client Secret', required: true },
          ],
        },
      },
      // New MCP Servers
      {
        id: 'sec-edgar',
        name: 'SEC EDGAR',
        description: 'Access SEC filings, company facts, and financial data. Query 10-K, 10-Q, 8-K forms and XBRL data. Public API, no auth required.',
        type: 'mcp',
        category: 'finance',
        enabled: true,
        config: {
          serverName: 'sec-edgar',
          requiresAuth: false,
        },
      },
      {
        id: 'bitwave-price',
        name: 'Bitwave Price',
        description: 'Get cryptocurrency prices for accounting. Current prices, historical data, and batch pricing.',
        type: 'mcp',
        category: 'finance',
        enabled: true,
        config: {
          serverName: 'bitwave-price',
          requiresAuth: false,
          tokenFields: [{ name: 'token1', label: 'API Key (optional)', required: false }],
        },
      },
      {
        id: 'wallet-balance',
        name: 'Wallet Balance',
        description: 'Get wallet balances across 60+ blockchain networks. Supports Ethereum, Polygon, Arbitrum, Base, Solana, Bitcoin, Cardano, and more. Uses Etherscan V2 unified API for 34+ EVM chains.',
        type: 'mcp',
        category: 'blockchain',
        enabled: true,
        config: {
          serverName: 'wallet-balance',
          requiresAuth: false,
          tokenFields: [
            { name: 'token1', label: 'Etherscan V2 API Key (for 34+ EVM chains)', required: false, keyName: 'etherscan_v2' },
            { name: 'token2', label: 'Blockfrost API Key (for Cardano)', required: false, keyName: 'blockfrost_cardano' },
            { name: 'token3', label: 'FTMScan API Key (for Fantom)', required: false, keyName: 'ftmscan' },
          ],
        },
      },
      {
        id: 'binanceus',
        name: 'BinanceUS',
        description: 'Access Binance US exchange: account balances, trades, deposits, withdrawals, and order history.',
        type: 'mcp',
        category: 'exchange',
        enabled: true,
        config: {
          serverName: 'binanceus',
          requiresAuth: true,
          tokenFields: [
            { name: 'token1', label: 'API Key', required: true },
            { name: 'token2', label: 'API Secret', required: true },
          ],
        },
      },
      {
        id: 'kraken',
        name: 'Kraken',
        description: 'Access Kraken exchange: balances, orders, trades, ledger history, and deposit/withdrawal info.',
        type: 'mcp',
        category: 'exchange',
        enabled: true,
        config: {
          serverName: 'kraken',
          requiresAuth: true,
          tokenFields: [
            { name: 'token1', label: 'API Key', required: true },
            { name: 'token2', label: 'Private Key (base64)', required: true },
          ],
        },
      },
      {
        id: 'coinbase',
        name: 'Coinbase',
        description: 'Access Coinbase accounts, transactions, deposits, and withdrawals. Uses JWT authentication.',
        type: 'mcp',
        category: 'exchange',
        enabled: true,
        config: {
          serverName: 'coinbase',
          requiresAuth: true,
          tokenFields: [
            { name: 'token1', label: 'API Key Name', required: true },
            { name: 'token2', label: 'Private Key (PEM)', required: true },
          ],
        },
      },
      {
        id: 'google-docs',
        name: 'Google Docs',
        description: 'Create, read, update, and search Google Documents. Insert text, export to various formats.',
        type: 'mcp',
        category: 'productivity',
        enabled: true,
        config: {
          serverName: 'google-docs',
          requiresAuth: true,
          tokenFields: [
            { name: 'token1', label: 'Access Token', required: true },
            { name: 'token2', label: 'Refresh Token', required: true },
            { name: 'token3', label: 'Client ID', required: true },
            { name: 'token4', label: 'Client Secret', required: true },
          ],
        },
      },
      // Additional MCP Servers
      {
        id: 'plaid',
        name: 'Plaid',
        description: 'Access bank accounts, balances, transactions, and identity data via Plaid.',
        type: 'mcp',
        category: 'finance',
        enabled: true,
        config: {
          serverName: 'plaid',
          requiresAuth: true,
          tokenFields: [
            { name: 'token1', label: 'Client ID', required: true },
            { name: 'token2', label: 'Secret', required: true },
            { name: 'token3', label: 'Access Token', required: true },
          ],
        },
      },
      {
        id: 'kaiko',
        name: 'Kaiko',
        description: 'Institutional-grade crypto market data: prices, VWAP, OHLCV, and trades.',
        type: 'mcp',
        category: 'finance',
        enabled: true,
        config: {
          serverName: 'kaiko',
          requiresAuth: true,
          tokenFields: [{ name: 'token1', label: 'API Key', required: true }],
        },
      },
      {
        id: 'thetie-canton',
        name: 'TheTie Canton',
        description: 'Canton Network analytics: validators, rewards, holders, transactions.',
        type: 'mcp',
        category: 'blockchain',
        enabled: true,
        config: {
          serverName: 'thetie-canton',
          requiresAuth: false,
          tokenFields: [{ name: 'token1', label: 'API Key (optional)', required: false }],
        },
      },
      {
        id: 'chatscraper',
        name: 'ChatScraper',
        description: 'Scrape messages from Telegram and Slack channels.',
        type: 'mcp',
        category: 'communication',
        enabled: true,
        config: {
          serverName: 'chatscraper',
          requiresAuth: true,
          tokenFields: [
            { name: 'token1', label: 'Telegram Token', required: false },
            { name: 'token2', label: 'Slack Token', required: false },
          ],
        },
      },
      {
        id: 'gamma',
        name: 'Gamma',
        description: 'Generate beautiful presentations using AI.',
        type: 'mcp',
        category: 'productivity',
        enabled: true,
        config: {
          serverName: 'gamma',
          requiresAuth: true,
          tokenFields: [{ name: 'token1', label: 'API Key', required: true }],
        },
      },
      {
        id: 'faam-tracker',
        name: 'FAAM Tracker',
        description: 'Monitor financial asset activity and transactions.',
        type: 'mcp',
        category: 'finance',
        enabled: true,
        config: {
          serverName: 'faam-tracker',
          requiresAuth: false,
          tokenFields: [{ name: 'token1', label: 'API Key (optional)', required: false }],
        },
      },
      {
        id: 'trader',
        name: 'AgenticLedger Trader',
        description: 'Manage automated trading campaigns with DCA, grid, and TWAP strategies.',
        type: 'mcp',
        category: 'trading',
        enabled: true,
        config: {
          serverName: 'trader',
          requiresAuth: true,
          tokenFields: [{ name: 'token1', label: 'API Key', required: true }],
        },
      },
    ];

    for (const cap of defaultCapabilities) {
      const existing = await this.getCapability(cap.id);
      if (!existing) {
        await this.upsertCapability(cap);
        console.log(`[capability] Seeded default capability: ${cap.name}`);
      }
    }
  }

  // ============================================================================
  // Per-Agent API Keys (env vars are fallback)
  // ============================================================================

  /**
   * Set an API key for an agent (encrypted)
   */
  async setAgentApiKey(agentId: string, key: string, value: string): Promise<void> {
    const { encrypted, iv } = encrypt(value);

    const existing = await db
      .select()
      .from(agentApiKeys)
      .where(and(eq(agentApiKeys.agentId, agentId), eq(agentApiKeys.key, key)));

    if (existing.length > 0) {
      await db
        .update(agentApiKeys)
        .set({
          encryptedValue: encrypted,
          iv,
          updatedAt: dbNow(),
        })
        .where(and(eq(agentApiKeys.agentId, agentId), eq(agentApiKeys.key, key)));
    } else {
      await db.insert(agentApiKeys).values({
        agentId,
        key,
        encryptedValue: encrypted,
        iv,
      });
    }
  }

  /**
   * Get an API key for an agent (decrypted)
   */
  async getAgentApiKey(agentId: string, key: string): Promise<string | null> {
    const rows = await db
      .select()
      .from(agentApiKeys)
      .where(and(eq(agentApiKeys.agentId, agentId), eq(agentApiKeys.key, key)));

    const row = rows[0];
    if (!row || !row.iv) return null;

    try {
      return decrypt(row.encryptedValue, row.iv);
    } catch {
      return null;
    }
  }

  /**
   * Check if an agent has an API key configured (without decrypting)
   */
  async hasAgentApiKey(agentId: string, key: string): Promise<boolean> {
    const rows = await db
      .select()
      .from(agentApiKeys)
      .where(and(eq(agentApiKeys.agentId, agentId), eq(agentApiKeys.key, key)));

    return rows.length > 0;
  }

  /**
   * Delete an API key for an agent
   */
  async deleteAgentApiKey(agentId: string, key: string): Promise<void> {
    await db.delete(agentApiKeys).where(and(eq(agentApiKeys.agentId, agentId), eq(agentApiKeys.key, key)));
  }

  /**
   * Get all API key status for an agent
   */
  async getAgentApiKeysStatus(agentId: string): Promise<{ key: string; configured: boolean; fromEnv: boolean }[]> {
    const keys = ['anthropic_api_key', 'openai_api_key', 'gemini_api_key', 'grok_api_key'];
    const envMap: Record<string, string> = {
      anthropic_api_key: 'ANTHROPIC_API_KEY',
      openai_api_key: 'OPENAI_API_KEY',
      gemini_api_key: 'GEMINI_API_KEY',
      grok_api_key: 'GROK_API_KEY',
    };

    const results: { key: string; configured: boolean; fromEnv: boolean }[] = [];

    for (const key of keys) {
      const configured = await this.hasAgentApiKey(agentId, key);
      const envVar = envMap[key];
      const fromEnv = !!(envVar && process.env[envVar]);
      results.push({ key, configured, fromEnv });
    }

    return results;
  }
}

// Helper function: Get API key for an agent (checks agent first, then env var as fallback)
export async function getAgentApiKeyWithFallback(agentId: string, key: string): Promise<string | null> {
  // First check agent-specific key in database
  const agentKey = await capabilityService.getAgentApiKey(agentId, key);
  if (agentKey) {
    return agentKey;
  }

  // Fall back to environment variable
  const envMap: Record<string, string> = {
    anthropic_api_key: 'ANTHROPIC_API_KEY',
    openai_api_key: 'OPENAI_API_KEY',
    gemini_api_key: 'GEMINI_API_KEY',
    grok_api_key: 'GROK_API_KEY',
  };

  const envVar = envMap[key];
  if (envVar && process.env[envVar]) {
    return process.env[envVar]!;
  }

  return null;
}

// Export singleton
export const capabilityService = new CapabilityService();
