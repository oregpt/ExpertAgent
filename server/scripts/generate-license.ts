#!/usr/bin/env ts-node
/**
 * License Key Generator — Agent-in-a-Box v2
 *
 * Usage:
 *   # Generate from tier preset:
 *   LICENSE_SECRET=xxx npx ts-node scripts/generate-license.ts --org "Acme Corp" --tier pro
 *
 *   # Generate with custom flags:
 *   LICENSE_SECRET=xxx npx ts-node scripts/generate-license.ts --org "Acme Corp" --custom soulMemory,deepTools,multiChannel
 *
 *   # With expiration and custom name:
 *   LICENSE_SECRET=xxx npx ts-node scripts/generate-license.ts --org "Acme Corp" --tier enterprise --name "Acme Enterprise" --expires 1y
 *
 * Options:
 *   --org      Organization name (required)
 *   --tier     License tier: starter | pro | enterprise
 *   --custom   Comma-separated feature flags to enable (starts from base)
 *   --name     Human-readable license name (optional, defaults to "org — tier")
 *   --expires  Expiry duration (e.g., 30d, 6m, 1y — default: 1y)
 *   --decode   Decode an existing token (pass token as value)
 *
 * Environment:
 *   LICENSE_SECRET  — REQUIRED. The signing secret for JWT generation.
 */

import {
  generateLicenseKey,
  generateLicenseForTier,
  buildCustomFeatures,
  decodeLicenseKey,
  TIER_PRESETS,
  LicenseTier,
} from '../src/licensing/license';
import { FeatureFlags } from '../src/licensing/features';

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = 'true';
      }
    }
  }

  return args;
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const args = parseArgs();

  // ---- Decode mode ----
  if (args['decode']) {
    const token = args['decode'];
    const decoded = decodeLicenseKey(token);
    if (!decoded) {
      console.error('❌ Failed to decode token');
      process.exit(1);
    }
    console.log('\n🔍 Decoded License Token:\n');
    console.log(JSON.stringify(decoded, null, 2));
    return;
  }

  // ---- Generate mode ----
  const org = args['org'];
  if (!org) {
    console.error('❌ --org is required. Usage:');
    console.error('   LICENSE_SECRET=xxx npx ts-node scripts/generate-license.ts --org "Acme Corp" --tier pro');
    console.error('   LICENSE_SECRET=xxx npx ts-node scripts/generate-license.ts --org "Acme Corp" --custom soulMemory,deepTools');
    process.exit(1);
  }

  const tier = args['tier'] as LicenseTier | undefined;
  const custom = args['custom'];
  const name = args['name'];
  const expires = args['expires'] || '1y';

  if (!tier && !custom) {
    console.error('❌ Either --tier or --custom is required.');
    console.error('   Tiers: starter, pro, enterprise');
    console.error('   Custom: comma-separated flags (e.g., soulMemory,deepTools,multiChannel)');
    process.exit(1);
  }

  if (tier && custom) {
    console.error('❌ Cannot use both --tier and --custom. Pick one.');
    process.exit(1);
  }

  // Check LICENSE_SECRET
  if (!process.env.LICENSE_SECRET || process.env.LICENSE_SECRET === 'agenticledger-default-secret-change-in-production') {
    console.error('❌ LICENSE_SECRET environment variable must be set.');
    console.error('   Example: LICENSE_SECRET=my-super-secret npx ts-node scripts/generate-license.ts ...');
    process.exit(1);
  }

  let features: FeatureFlags;
  let tierLabel: string;

  if (tier) {
    if (!TIER_PRESETS[tier]) {
      console.error(`❌ Unknown tier "${tier}". Valid tiers: starter, pro, enterprise`);
      process.exit(1);
    }
    features = { ...TIER_PRESETS[tier] };
    tierLabel = tier;
  } else {
    const flagNames = custom!.split(',').map((s) => s.trim()).filter(Boolean);
    features = buildCustomFeatures(flagNames);
    tierLabel = `custom (${flagNames.join(', ')})`;
  }

  // Generate
  try {
    const token = generateLicenseKey(
      {
        org,
        name: name || `${org} — ${tierLabel}`,
        features,
      },
      expires
    );

    console.log('\n✅ License Key Generated\n');
    console.log('─'.repeat(60));
    console.log(`Organization:  ${org}`);
    console.log(`License Name:  ${name || `${org} — ${tierLabel}`}`);
    console.log(`Tier:          ${tierLabel}`);
    console.log(`Expires In:    ${expires}`);
    console.log('─'.repeat(60));
    console.log('\nFeatures:');

    const flagEntries = Object.entries(features) as [string, any][];
    for (const [key, value] of flagEntries) {
      if (key === 'allowedCapabilities') {
        console.log(`  ${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
      } else {
        const icon = value === true ? '✅' : value === false ? '❌' : `  ${value}`;
        console.log(`  ${icon} ${key}${typeof value === 'number' ? `: ${value}` : ''}`);
      }
    }

    console.log('\n─'.repeat(60));
    console.log('\nToken (set as AGENTICLEDGER_LICENSE_KEY):');
    console.log(`\n${token}\n`);

  } catch (err) {
    console.error('❌ Failed to generate license:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
