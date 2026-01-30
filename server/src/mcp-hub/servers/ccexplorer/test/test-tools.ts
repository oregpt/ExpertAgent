/**
 * CC Explorer MCP Server - Tool Tests
 * 
 * This script tests each tool against the live API
 * and documents the results.
 */

import { CCExplorerClient } from '../src/api-client.js';

const API_KEY = process.env.CCEXPLORER_API_KEY || '';

interface TestResult {
  tool: string;
  status: 'pass' | 'fail';
  duration: number;
  response?: string;
  error?: string;
}

async function runTests(): Promise<void> {
  if (!API_KEY) {
    console.error('Error: CCEXPLORER_API_KEY environment variable not set');
    process.exit(1);
  }

  const api = new CCExplorerClient(API_KEY);
  const results: TestResult[] = [];

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  CC Explorer MCP Server - Tool Test Suite');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  API Key: ${API_KEY.substring(0, 10)}...`);
  console.log(`  Tools: 14 total`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Fetch sample IDs for testing
  console.log('📋 Fetching sample IDs for testing...\n');

  const samplePartyId = 'Cumberland-1::12201aa8a23046d5740c9edd58f7e820c83e7f5c58f25551f955f3252d3a04240860';
  let sampleContractId = '';
  let sampleUpdateId = '';
  let sampleTrackingCid = '';

  try {
    // Get update ID
    const updates = await api.getUpdates(1) as any;
    if (updates.updates?.[0]) {
      sampleUpdateId = updates.updates[0].updateId;
      console.log(`  ✓ Sample updateId: ${sampleUpdateId.substring(0, 40)}...`);
    }

    // Get governance tracking CID and contract ID
    const overview = await api.getOverview() as any;
    if (overview.openVotes?.[0]) {
      sampleTrackingCid = overview.openVotes[0].payload?.trackingCid || '';
      sampleContractId = overview.openVotes[0].contract_id || '';
      console.log(`  ✓ Sample trackingCid: ${sampleTrackingCid.substring(0, 40)}...`);
      console.log(`  ✓ Sample contractId: ${sampleContractId.substring(0, 40)}...`);
    }
  } catch (e) {
    console.log('  ⚠ Could not fetch all sample IDs:', e);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Testing All 14 Tools');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Define tests using the API client methods
  const tests: { name: string; fn: () => Promise<any> }[] = [
    { name: 'consensus_get', fn: () => api.getConsensus() },
    { name: 'round_current', fn: () => api.getCurrentRound() },
    { name: 'overview_get', fn: () => api.getOverview() },
    { name: 'governance_list', fn: () => api.getGovernance() },
    { name: 'super_validators_list', fn: () => api.getSuperValidators() },
    { name: 'validators_list', fn: () => api.getValidators() },
    { name: 'updates_list', fn: () => api.getUpdates(2) },
    { name: 'search', fn: () => api.search('Cumberland') },
    { name: 'party_get', fn: () => api.getPartyDetail(samplePartyId) },
    { name: 'party_updates_list', fn: () => api.getPartyUpdates(samplePartyId, 2) },
    { name: 'contract_get', fn: () => api.getContract(sampleContractId) },
    { name: 'contract_updates_list', fn: () => api.getContractUpdates(sampleContractId, 1) },
    { name: 'update_get', fn: () => api.getUpdateDetail(sampleUpdateId) },
    { name: 'governance_get', fn: () => api.getGovernanceDetail(sampleTrackingCid) },
  ];

  for (const test of tests) {
    const start = Date.now();

    try {
      const response = await test.fn();
      const duration = Date.now() - start;

      if ((response as any).error) {
        console.log(`  ❌ ${test.name} (${duration}ms)`);
        console.log(`     Error: ${(response as any).error}`);
        results.push({ tool: test.name, status: 'fail', duration, error: (response as any).error });
      } else {
        console.log(`  ✅ ${test.name} (${duration}ms)`);
        results.push({ tool: test.name, status: 'pass', duration, response: 'OK' });
      }
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : 'Unknown error';
      console.log(`  ❌ ${test.name} (${duration}ms)`);
      console.log(`     Error: ${error}`);
      results.push({ tool: test.name, status: 'fail', duration, error });
    }

    // Rate limit delay
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Summary
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const avgDuration = Math.round(results.reduce((a, r) => a + r.duration, 0) / results.length);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Test Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📊 Pass Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
  console.log(`  ⏱  Avg Duration: ${avgDuration}ms`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Output JSON results
  console.log('📄 Full Results (JSON):\n');
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { passed, failed, total: results.length, avgDuration },
    results
  }, null, 2));
}

runTests().catch(console.error);
