/**
 * MCP Full Test - Captures message sent and full response
 */
import fs from 'fs';

const API_BASE = 'http://localhost:4501/api/admin';

interface TestConfig {
  server: string;
  tool: string;
  args: Record<string, any>;
  description: string;
}

interface FullTestResult {
  server: string;
  tool: string;
  description: string;
  request: {
    endpoint: string;
    method: string;
    body: {
      server: string;
      tool: string;
      arguments: Record<string, any>;
    };
  };
  response: {
    status: number;
    statusText: string;
    body: any;
  };
  result: 'PASS' | 'FAIL';
  error?: string;
  timestamp: string;
}

const TESTS: TestConfig[] = [
  // Price/Market Data
  { server: 'sec-edgar', tool: 'search_filings', args: { cik: '320193', limit: 1 }, description: 'SEC EDGAR - Search Apple filings' },
  { server: 'bitwave-price', tool: 'list_supported_assets', args: {}, description: 'Bitwave Price - List supported assets' },
  { server: 'binanceus', tool: 'get_ticker_price', args: { symbol: 'BTCUSDT' }, description: 'BinanceUS - Get BTC price' },
  { server: 'kraken', tool: 'get_ticker', args: { pair: 'XBTUSD' }, description: 'Kraken - Get BTC ticker' },
  { server: 'kaiko', tool: 'get_direct_price', args: { baseAsset: 'btc', quoteAsset: 'usd' }, description: 'Kaiko - Get BTC price' },
  { server: 'coinbase', tool: 'get_spot_price', args: { currencyPair: 'BTC-USD' }, description: 'Coinbase - Get BTC spot' },
  
  // Canton/Blockchain
  { server: 'thetie-canton', tool: 'get_cumulative_metrics', args: {}, description: 'TheTie Canton - Get metrics' },
  { server: 'lighthouse', tool: 'price_get', args: {}, description: 'Lighthouse - Get price' },
  { server: 'ccview', tool: 'explore_stats', args: {}, description: 'CCView - Explorer stats' },
  { server: 'ccexplorer', tool: 'overview_get', args: {}, description: 'CCExplorer - Overview' },
  { server: 'wallet-balance', tool: 'list_supported_chains', args: {}, description: 'Wallet Balance - List chains' },
  
  // Communication
  { server: 'slack', tool: 'list_channels', args: {}, description: 'Slack - List channels' },
  { server: 'notion', tool: 'search', args: { query: 'test' }, description: 'Notion - Search' },
  
  // Google Services
  { server: 'google-calendar', tool: 'list_calendars', args: {}, description: 'Google Calendar - List calendars' },
  { server: 'gmail', tool: 'list_labels', args: {}, description: 'Gmail - List labels' },
  { server: 'google-sheets', tool: 'list_sheets', args: { spreadsheetId: 'test' }, description: 'Google Sheets - List sheets' },
  { server: 'google-docs', tool: 'get_document', args: { documentId: 'test' }, description: 'Google Docs - Get doc' },
  
  // Business/Finance
  { server: 'quickbooks', tool: 'get_company_info', args: {}, description: 'QuickBooks - Company info' },
  { server: 'plaid', tool: 'get_accounts', args: {}, description: 'Plaid - Get accounts' },
  
  // Utility
  { server: 'anyapi', tool: 'list_available_apis', args: {}, description: 'AnyAPI - List APIs' },
  // Removed: ChatScraper, Gamma, FAAM Tracker, Trader (not needed)
];

async function testTool(config: TestConfig): Promise<FullTestResult> {
  const requestBody = {
    server: config.server,
    tool: config.tool,
    arguments: config.args
  };

  const result: FullTestResult = {
    server: config.server,
    tool: config.tool,
    description: config.description,
    request: {
      endpoint: `${API_BASE}/mcp/execute`,
      method: 'POST',
      body: requestBody
    },
    response: {
      status: 0,
      statusText: '',
      body: null
    },
    result: 'FAIL',
    timestamp: new Date().toISOString()
  };

  try {
    const response = await fetch(`${API_BASE}/mcp/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    result.response.status = response.status;
    result.response.statusText = response.statusText;
    
    const data = await response.json();
    result.response.body = data;

    if (response.ok && !data.error) {
      result.result = 'PASS';
    } else {
      result.result = 'FAIL';
      result.error = data.error || data.message || `HTTP ${response.status}`;
    }
  } catch (error: any) {
    result.result = 'FAIL';
    result.error = error.message;
    result.response.body = { fetchError: error.message };
  }

  return result;
}

async function main() {
  const results: FullTestResult[] = [];
  const startTime = new Date();

  console.log('Starting MCP Full Test...\n');

  for (const test of TESTS) {
    process.stdout.write(`Testing ${test.description}... `);
    const result = await testTool(test);
    results.push(result);
    
    const icon = result.result === 'PASS' ? '✅' : '❌';
    console.log(`${icon} ${result.result}`);
  }

  const passed = results.filter(r => r.result === 'PASS').length;
  const failed = results.filter(r => r.result === 'FAIL').length;

  // Generate detailed markdown report
  let report = `# MCP Full Test Report

**Generated:** ${startTime.toISOString()}  
**Duration:** ${((Date.now() - startTime.getTime()) / 1000).toFixed(1)}s  
**API Endpoint:** \`${API_BASE}/mcp/execute\`

---

## Summary

| Result | Count |
|--------|-------|
| ✅ PASS | ${passed} |
| ❌ FAIL | ${failed} |
| **Total** | ${results.length} |

---

## Detailed Results

`;

  for (const r of results) {
    const icon = r.result === 'PASS' ? '✅' : '❌';
    report += `### ${icon} ${r.description}

**Server:** \`${r.server}\`  
**Tool:** \`${r.tool}\`  
**Result:** ${r.result}  
**Timestamp:** ${r.timestamp}

#### Request Sent
\`\`\`json
POST ${r.request.endpoint}
${JSON.stringify(r.request.body, null, 2)}
\`\`\`

#### Response Received
\`\`\`json
HTTP ${r.response.status} ${r.response.statusText}
${JSON.stringify(r.response.body, null, 2).substring(0, 2000)}${JSON.stringify(r.response.body).length > 2000 ? '\n... (truncated)' : ''}
\`\`\`

${r.error ? `**Error:** ${r.error}\n` : ''}
---

`;
  }

  // Write report
  const reportPath = '../MCP_FULL_TEST_REPORT.md';
  fs.writeFileSync(reportPath, report);
  console.log(`\n✅ Report saved to ${reportPath}`);

  // Summary
  console.log(`\n========================================`);
  console.log(`SUMMARY: ${passed}/${results.length} PASSED`);
  console.log(`========================================`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
