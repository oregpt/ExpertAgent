/**
 * ccview.io MCP Server - Tool Tests
 * 
 * This script tests each stable tool against the live API
 * and documents the results.
 */

import { CcviewApiClient } from '../src/api-client.js';
import { TOOLS, getStableTools, getToolCounts } from '../src/tools.js';

const API_KEY = process.env.CCVIEW_API_KEY || 'mainnet_b6b78f4559c6700a';

interface TestResult {
  tool: string;
  status: 'pass' | 'fail';
  duration: number;
  response?: string;
  error?: string;
}

async function runTests(): Promise<void> {
  const api = new CcviewApiClient({ apiKey: API_KEY, rateLimitMs: 2500 });
  const results: TestResult[] = [];
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ccview.io MCP Server - Tool Test Suite');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  API Key: ${API_KEY.substring(0, 10)}...`);
  console.log(`  Tools: ${getToolCounts().total} total (${getToolCounts().stable} stable)`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // First, get some sample IDs we can use for testing
  console.log('📋 Fetching sample IDs for testing...\n');
  
  let samplePartyId = '';
  let sampleEventId = '';
  let sampleValidatorId = '';
  let sampleTrackingCid = '';

  try {
    // Get a transfer to extract party_id and event_id
    const transfers = await api.v2<any>('token-transfers', { limit: 1 });
    if (transfers.data?.[0]) {
      sampleEventId = transfers.data[0].event_id;
      samplePartyId = transfers.data[0].transfer_data?.sender || '';
      console.log(`  ✓ Sample event_id: ${sampleEventId.substring(0, 30)}...`);
      console.log(`  ✓ Sample party_id: ${samplePartyId.substring(0, 30)}...`);
    }

    // Get a validator
    const validators = await api.v2<any>('validators', { offset: 0, limit: 1 });
    if (validators.data?.[0]) {
      sampleValidatorId = validators.data[0].validator_id;
      console.log(`  ✓ Sample validator_id: ${sampleValidatorId.substring(0, 30)}...`);
    }

    // Get a governance proposal
    const govs = await api.v2<any>('governances/active', { offset: 0, limit: 1 });
    if (govs.data?.[0]) {
      sampleTrackingCid = govs.data[0].tracking_cid;
      console.log(`  ✓ Sample tracking_cid: ${sampleTrackingCid.substring(0, 30)}...`);
    }
  } catch (e) {
    console.log('  ⚠ Could not fetch all sample IDs');
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Testing Stable Tools');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const stableTools = getStableTools();
  
  for (const tool of stableTools) {
    const start = Date.now();
    
    try {
      // Build endpoint with sample params
      let endpoint = tool.endpoint;
      const params: Record<string, any> = {};
      
      // Replace path params
      endpoint = endpoint.replace('{party_id}', samplePartyId);
      endpoint = endpoint.replace('{event_id}', sampleEventId);
      endpoint = endpoint.replace('{validator_id}', sampleValidatorId);
      endpoint = endpoint.replace('{tracking_cid}', sampleTrackingCid);
      endpoint = endpoint.replace('{name}', 'testname123');
      endpoint = endpoint.replace('{ans}', 'testname123');
      
      // Add common query params
      if (tool.inputSchema.properties.offset) params.offset = 0;
      if (tool.inputSchema.properties.limit) params.limit = 1;
      if (tool.inputSchema.properties.start) params.start = '2024-01-01';
      if (tool.inputSchema.properties.end) params.end = '2024-12-31';
      if (tool.inputSchema.properties.arg) params.arg = 'test';
      if (tool.inputSchema.properties.validator_id && !endpoint.includes(sampleValidatorId)) {
        params.validator_id = sampleValidatorId;
      }
      if (tool.inputSchema.properties.party_id && !endpoint.includes(samplePartyId)) {
        params.party_id = samplePartyId;
      }
      
      const response = await api.request<any>(endpoint, params, tool.version);
      const duration = Date.now() - start;
      
      if (response.error) {
        console.log(`  ❌ ${tool.name}`);
        console.log(`     Error: ${response.error.substring(0, 60)}...`);
        results.push({ tool: tool.name, status: 'fail', duration, error: response.error });
      } else {
        const dataCount = response.data ? response.data.length : 'n/a';
        console.log(`  ✅ ${tool.name} (${duration}ms, ${dataCount} items)`);
        results.push({ 
          tool: tool.name, 
          status: 'pass', 
          duration,
          response: `${dataCount} items returned`
        });
      }
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : 'Unknown error';
      console.log(`  ❌ ${tool.name}`);
      console.log(`     Error: ${error.substring(0, 60)}`);
      results.push({ tool: tool.name, status: 'fail', duration, error });
    }
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
