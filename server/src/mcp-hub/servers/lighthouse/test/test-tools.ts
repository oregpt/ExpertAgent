/**
 * Lighthouse MCP Server - Tool Test Suite
 * 
 * Run: npx tsx test/test-tools.ts
 * No API key required (public API)
 */

import { LighthouseClient } from '../src/api-client.js';

const client = new LighthouseClient();

interface TestResult {
  tool: string;
  status: 'pass' | 'fail';
  time: number;
  error?: string;
  response?: any;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<any>) {
  const start = Date.now();
  try {
    const response = await fn();
    const time = Date.now() - start;
    results.push({ tool: name, status: 'pass', time, response });
    console.log(`✅ ${name} (${time}ms)`);
  } catch (error) {
    const time = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ tool: name, status: 'fail', time, error: message });
    console.log(`❌ ${name} (${time}ms) - ${message}`);
  }
}

async function runTests() {
  console.log('\n🔦 Lighthouse MCP Server - Test Suite\n');
  console.log('Base URL: https://lighthouse.cantonloop.com/api');
  console.log('API Key: Not required (public API)\n');
  console.log('─'.repeat(50));

  // CNS
  await test('cns_list', () => client.listCns(5));
  await test('cns_get', () => client.getCns('test.cc').catch(() => ({ note: 'Domain may not exist' })));

  // Contracts
  await test('contracts_list', () => client.listContracts(5));
  // Skip contract_get - need valid ID

  // Featured Apps
  await test('featured_apps_get', () => client.getFeaturedApps());

  // Governance
  await test('governance_list', () => client.listGovernance());
  await test('governance_stats', () => client.getGovernanceStats());
  // Skip governance_get - need valid ID

  // Me
  await test('me_get', () => client.getMe());

  // Prices
  await test('price_get', () => client.getPrice());
  await test('price_history', () => client.getPriceRange('amulet', 'UTC'));

  // Rounds
  await test('rounds_list', () => client.listRounds(undefined, 5));
  await test('round_get', () => client.getRound(80882));

  // Search
  await test('search', () => client.search('Digital-Asset'));

  // Stats
  await test('stats_get', () => client.getStats());
  await test('stats_rounds_latest', () => client.getLatestRounds());

  // Super Validators
  await test('super_validators_list', () => client.listSuperValidators());

  // Transactions
  await test('transactions_list', () => client.listTransactions(5));
  // Skip transaction_get - need valid ID

  // Transfers
  await test('transfers_list', () => client.listTransfers(undefined, undefined, 5));
  // Skip transfer_get - need valid ID

  // Validators
  await test('validators_list', () => client.listValidators());
  // Skip validator_get - need valid ID

  // Preapprovals
  await test('preapprovals_list', () => client.listPreapprovals(5));

  // Summary
  console.log('\n' + '─'.repeat(50));
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const avgTime = Math.round(results.reduce((sum, r) => sum + r.time, 0) / results.length);

  console.log(`\n📊 Results: ${passed}/${results.length} passed`);
  console.log(`⏱️  Average response time: ${avgTime}ms`);
  console.log(`✅ Pass rate: ${Math.round((passed / results.length) * 100)}%\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`  - ${r.tool}: ${r.error}`);
    });
  }
}

runTests().catch(console.error);
