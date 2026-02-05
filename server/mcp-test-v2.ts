/**
 * MCP Capability Test v2 - Direct tool execution
 */

const API_BASE = 'http://localhost:4501/api/admin';

interface TestConfig {
  server: string;
  tool: string;
  args: Record<string, any>;
  description: string;
}

interface TestResult {
  server: string;
  tool: string;
  description: string;
  result: 'PASS' | 'FAIL';
  responsePreview?: string;
  error?: string;
}

const TESTS: TestConfig[] = [
  // Price/Market Data MCPs
  { server: 'sec-edgar', tool: 'search_filings', args: { cik: '320193', limit: 1 }, description: 'SEC EDGAR - Search filings (AAPL)' },
  { server: 'bitwave-price', tool: 'list_supported_assets', args: {}, description: 'Bitwave Price - List supported assets' },
  { server: 'binanceus', tool: 'get_ticker_price', args: { symbol: 'BTCUSDT' }, description: 'BinanceUS - Get BTC price' },
  { server: 'kraken', tool: 'get_ticker', args: { pair: 'XBTUSD' }, description: 'Kraken - Get BTC ticker' },
  { server: 'kaiko', tool: 'get_direct_price', args: { baseAsset: 'btc', quoteAsset: 'usd' }, description: 'Kaiko - Get BTC price' },
  { server: 'coinbase', tool: 'get_spot_price', args: { currencyPair: 'BTC-USD' }, description: 'Coinbase - Get BTC spot price' },
  
  // Canton/Blockchain MCPs
  { server: 'thetie-canton', tool: 'get_cumulative_metrics', args: {}, description: 'TheTie Canton - Get metrics' },
  { server: 'lighthouse', tool: 'price_get', args: {}, description: 'Lighthouse - Get price' },
  { server: 'ccview', tool: 'explore_stats', args: {}, description: 'CCView - Get explorer stats' },
  { server: 'ccexplorer', tool: 'overview_get', args: {}, description: 'CCExplorer - Get overview' },
  { server: 'wallet-balance', tool: 'list_supported_chains', args: {}, description: 'Wallet Balance - List supported chains' },
  
  // Communication MCPs
  { server: 'slack', tool: 'list_channels', args: {}, description: 'Slack - List channels' },
  
  // Google Services MCPs (require OAuth)
  { server: 'google-calendar', tool: 'list_calendars', args: {}, description: 'Google Calendar - List calendars' },
  { server: 'gmail', tool: 'list_labels', args: {}, description: 'Gmail - List labels' },
  { server: 'google-sheets', tool: 'list_sheets', args: { spreadsheetId: 'test' }, description: 'Google Sheets - List sheets' },
  { server: 'google-docs', tool: 'get_document', args: { documentId: 'test' }, description: 'Google Docs - Get document' },
  
  // Business/Finance MCPs
  { server: 'quickbooks', tool: 'get_company_info', args: {}, description: 'QuickBooks - Get company info' },
  { server: 'plaid', tool: 'get_accounts', args: {}, description: 'Plaid - Get accounts' },
  { server: 'notion', tool: 'search', args: { query: 'test' }, description: 'Notion - Search' },
  
  // Utility MCPs
  { server: 'anyapi', tool: 'list_available_apis', args: {}, description: 'AnyAPI - List available APIs' },
  { server: 'chatscraper', tool: 'list_telegram_channels', args: {}, description: 'ChatScraper - List Telegram channels' },
  { server: 'gamma', tool: 'get_themes', args: {}, description: 'Gamma - Get themes' },
  { server: 'faam-tracker', tool: 'get_stats', args: {}, description: 'FAAM Tracker - Get stats' },
  { server: 'trader', tool: 'get_dashboard', args: {}, description: 'Trader - Get dashboard' },
];

async function testTool(config: TestConfig): Promise<TestResult> {
  const result: TestResult = {
    server: config.server,
    tool: config.tool,
    description: config.description,
    result: 'FAIL'
  };

  try {
    const response = await fetch(`${API_BASE}/mcp/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        server: config.server,
        tool: config.tool,
        arguments: config.args
      })
    });

    const data = await response.json();
    
    if (response.ok && !data.error) {
      result.result = 'PASS';
      result.responsePreview = JSON.stringify(data).substring(0, 200);
    } else {
      result.result = 'FAIL';
      result.error = data.error || data.message || `HTTP ${response.status}`;
    }
  } catch (error: any) {
    result.result = 'FAIL';
    result.error = error.message;
  }

  return result;
}

async function main() {
  console.log('='.repeat(100));
  console.log('MCP TOOL TEST REPORT');
  console.log('Generated:', new Date().toISOString());
  console.log('='.repeat(100));

  const results: TestResult[] = [];

  for (const test of TESTS) {
    process.stdout.write(`Testing ${test.description}... `);
    const result = await testTool(test);
    results.push(result);
    
    const icon = result.result === 'PASS' ? '✅' : '❌';
    console.log(`${icon} ${result.result}`);
    
    if (result.result === 'FAIL') {
      console.log(`   Error: ${result.error}`);
    }
  }

  // Summary
  console.log(`\n${'='.repeat(100)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(100)}`);

  const passed = results.filter(r => r.result === 'PASS').length;
  const failed = results.filter(r => r.result === 'FAIL').length;

  console.log(`Total Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  // Group by category
  const categories: Record<string, TestResult[]> = {
    'Price/Market Data': results.filter(r => ['sec-edgar', 'bitwave-price', 'binanceus', 'kraken', 'kaiko', 'coinbase'].includes(r.server)),
    'Canton/Blockchain': results.filter(r => ['thetie-canton', 'lighthouse', 'ccview', 'ccexplorer', 'wallet-balance'].includes(r.server)),
    'Communication': results.filter(r => ['slack'].includes(r.server)),
    'Google Services': results.filter(r => ['google-calendar', 'gmail', 'google-sheets', 'google-docs'].includes(r.server)),
    'Business/Finance': results.filter(r => ['quickbooks', 'plaid', 'notion'].includes(r.server)),
    'Utility': results.filter(r => ['anyapi', 'chatscraper', 'gamma', 'faam-tracker', 'trader'].includes(r.server)),
  };

  console.log(`\n${'─'.repeat(100)}`);
  console.log('RESULTS BY CATEGORY:');
  
  for (const [category, catResults] of Object.entries(categories)) {
    const catPassed = catResults.filter(r => r.result === 'PASS').length;
    console.log(`\n${category}: ${catPassed}/${catResults.length} passed`);
    for (const r of catResults) {
      const icon = r.result === 'PASS' ? '✅' : '❌';
      console.log(`  ${icon} ${r.description}`);
      if (r.result === 'FAIL' && r.error) {
        console.log(`     └─ ${r.error.substring(0, 80)}`);
      }
    }
  }

  // Markdown table
  console.log(`\n${'='.repeat(100)}`);
  console.log('MARKDOWN TABLE:');
  console.log('```');
  console.log('| Server | Tool | Status | Error |');
  console.log('|--------|------|--------|-------|');
  for (const r of results) {
    const icon = r.result === 'PASS' ? '✅' : '❌';
    const err = r.error ? r.error.substring(0, 50) : '-';
    console.log(`| ${r.server} | ${r.tool} | ${icon} | ${err} |`);
  }
  console.log('```');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
