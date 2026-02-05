/**
 * MCP Capability Test via HTTP API
 * Tests each capability by sending a chat message and checking if the tool is called
 */

const API_BASE = 'http://localhost:4501/api';

interface TestConfig {
  capabilityId: string;
  name: string;
  serverName: string;
  testPrompt: string;
  expectedTool?: string;
}

interface TestResult {
  capability: string;
  name: string;
  agent: string;
  agentId: string;
  testPrompt: string;
  result: 'PASS' | 'FAIL' | 'SKIP' | 'NO_TOOL';
  response?: string;
  toolsCalled?: string[];
  error?: string;
  explanation?: string;
}

const TEST_CONFIGS: TestConfig[] = [
  // Price/Market Data
  { capabilityId: 'sec-edgar', name: 'SEC EDGAR', serverName: 'sec-edgar', testPrompt: 'List the ticker symbols for the top 3 companies by market cap using SEC EDGAR', expectedTool: 'get_company_tickers' },
  { capabilityId: 'bitwave-price', name: 'Bitwave Price', serverName: 'bitwave-price', testPrompt: 'What tokens does the Bitwave price service support?', expectedTool: 'get_supported_tokens' },
  { capabilityId: 'binanceus', name: 'BinanceUS', serverName: 'binanceus', testPrompt: 'Get the current BTC price from Binance US', expectedTool: 'get_ticker_price' },
  { capabilityId: 'kraken', name: 'Kraken', serverName: 'kraken', testPrompt: 'Get the BTC/USD ticker from Kraken exchange', expectedTool: 'get_ticker' },
  { capabilityId: 'kaiko', name: 'Kaiko', serverName: 'kaiko', testPrompt: 'What instruments does Kaiko support for BTC?', expectedTool: 'get_instruments' },
  
  // Canton/Blockchain
  { capabilityId: 'thetie-canton', name: 'TheTie Canton', serverName: 'thetie-canton', testPrompt: 'List agents from TheTie Canton network', expectedTool: 'list_agents' },
  { capabilityId: 'mcp-lighthouse', name: 'Lighthouse', serverName: 'lighthouse', testPrompt: 'Get the current price from Lighthouse/CantonLoop', expectedTool: 'price_get' },
  { capabilityId: 'mcp-ccview', name: 'CCView', serverName: 'mcp-ccview', testPrompt: 'Get DAML parties from CCView Canton Explorer' },
  
  // Communication
  { capabilityId: 'slack', name: 'Slack', serverName: 'slack', testPrompt: 'List my Slack channels', expectedTool: 'slack_list_channels' },
  
  // Google Services
  { capabilityId: 'calendar', name: 'Google Calendar', serverName: 'google-calendar', testPrompt: 'List my Google calendars', expectedTool: 'list_calendars' },
  { capabilityId: 'email', name: 'Gmail', serverName: 'gmail', testPrompt: 'List my Gmail labels', expectedTool: 'list_labels' },
  
  // Other
  { capabilityId: 'gamma', name: 'Gamma', serverName: 'gamma', testPrompt: 'Check the health status of Gamma service' },
  { capabilityId: 'plaid', name: 'Plaid', serverName: 'plaid', testPrompt: 'Get a list of financial institutions from Plaid' },
  { capabilityId: 'anyapi', name: 'AnyAPI', serverName: 'anyapi', testPrompt: 'Use AnyAPI to get the weather in New York' },
];

const AGENTS = [
  { id: 'default-agent', name: 'Agent-in-a-Box' },
  { id: 'agent-1770259052719-vvcqgp', name: 'Finance Assistant' }
];

async function testCapability(agentId: string, agentName: string, config: TestConfig): Promise<TestResult> {
  const result: TestResult = {
    capability: config.capabilityId,
    name: config.name,
    agent: agentName,
    agentId,
    testPrompt: config.testPrompt,
    result: 'SKIP',
    toolsCalled: []
  };

  try {
    // First check if this agent has this capability enabled
    const capsRes = await fetch(`${API_BASE}/agents/${agentId}/capabilities`);
    if (!capsRes.ok) {
      result.result = 'FAIL';
      result.error = `Failed to fetch capabilities: ${capsRes.status}`;
      return result;
    }
    
    const capsData = await capsRes.json();
    const cap = capsData.capabilities?.find((c: any) => c.id === config.capabilityId);
    
    if (!cap) {
      result.result = 'SKIP';
      result.explanation = 'Capability not configured for this agent';
      return result;
    }
    
    if (!cap.agentEnabled) {
      result.result = 'SKIP';
      result.explanation = 'Capability disabled for this agent';
      return result;
    }

    // Send a chat message
    const chatRes = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        message: config.testPrompt,
        conversationId: `test-${Date.now()}`
      })
    });

    if (!chatRes.ok) {
      const errText = await chatRes.text();
      result.result = 'FAIL';
      result.error = `Chat API error: ${chatRes.status} - ${errText}`;
      return result;
    }

    // Read streaming response
    const reader = chatRes.body?.getReader();
    let fullResponse = '';
    const toolsCalled: string[] = [];
    
    if (reader) {
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'text') {
              fullResponse += data.content || '';
            }
            if (data.type === 'tool_use' || data.type === 'tool_call') {
              toolsCalled.push(data.name || data.tool || 'unknown');
            }
            if (data.toolName) {
              toolsCalled.push(data.toolName);
            }
          } catch (e) {
            // Skip non-JSON lines
          }
        }
      }
    }

    result.response = fullResponse.substring(0, 500);
    result.toolsCalled = [...new Set(toolsCalled)];

    // Determine pass/fail
    if (toolsCalled.length > 0) {
      // Check if expected tool was called
      if (config.expectedTool) {
        const found = toolsCalled.some(t => t.includes(config.expectedTool!) || t === config.expectedTool);
        result.result = found ? 'PASS' : 'FAIL';
        if (!found) {
          result.explanation = `Expected tool ${config.expectedTool} but got: ${toolsCalled.join(', ')}`;
        }
      } else {
        result.result = 'PASS';
      }
    } else {
      // No tools called - might be an error response
      if (fullResponse.toLowerCase().includes('error') || 
          fullResponse.toLowerCase().includes('unable') ||
          fullResponse.toLowerCase().includes("don't have") ||
          fullResponse.toLowerCase().includes('not available')) {
        result.result = 'FAIL';
        result.explanation = 'Response indicates capability not working';
      } else {
        result.result = 'NO_TOOL';
        result.explanation = 'No tool was called - agent may have answered from knowledge';
      }
    }

  } catch (error: any) {
    result.result = 'FAIL';
    result.error = error.message;
  }

  return result;
}

async function main() {
  console.log('='.repeat(100));
  console.log('MCP CAPABILITY TEST REPORT');
  console.log('Generated:', new Date().toISOString());
  console.log('API Base:', API_BASE);
  console.log('='.repeat(100));

  const results: TestResult[] = [];

  for (const agent of AGENTS) {
    console.log(`\n${'─'.repeat(100)}`);
    console.log(`AGENT: ${agent.name} (${agent.id})`);
    console.log(`${'─'.repeat(100)}`);

    for (const config of TEST_CONFIGS) {
      process.stdout.write(`Testing ${config.name}... `);
      
      const result = await testCapability(agent.id, agent.name, config);
      results.push(result);

      const icon = result.result === 'PASS' ? '✅' : 
                   result.result === 'FAIL' ? '❌' : 
                   result.result === 'NO_TOOL' ? '⚠️' : '⏭️';
      
      console.log(`${icon} ${result.result}`);
      
      if (result.result === 'FAIL') {
        console.log(`   Error: ${result.error || result.explanation}`);
      }
      if (result.toolsCalled && result.toolsCalled.length > 0) {
        console.log(`   Tools: ${result.toolsCalled.join(', ')}`);
      }
    }
  }

  // Summary
  console.log(`\n${'='.repeat(100)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(100)}`);

  const passed = results.filter(r => r.result === 'PASS').length;
  const failed = results.filter(r => r.result === 'FAIL').length;
  const skipped = results.filter(r => r.result === 'SKIP').length;
  const noTool = results.filter(r => r.result === 'NO_TOOL').length;

  console.log(`Total Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️ Skipped: ${skipped}`);
  console.log(`⚠️ No Tool Called: ${noTool}`);

  // Failures detail
  const failures = results.filter(r => r.result === 'FAIL');
  if (failures.length > 0) {
    console.log(`\n${'─'.repeat(100)}`);
    console.log('FAILURES:');
    for (const r of failures) {
      console.log(`  ❌ ${r.name} (${r.capability}) on ${r.agent}`);
      console.log(`     Reason: ${r.explanation || r.error}`);
    }
  }

  // Generate markdown report
  console.log(`\n${'='.repeat(100)}`);
  console.log('MARKDOWN REPORT:');
  console.log('```');
  console.log('# MCP Capability Test Report');
  console.log(`Generated: ${new Date().toISOString()}\n`);
  console.log('## Summary');
  console.log(`| Metric | Count |`);
  console.log(`|--------|-------|`);
  console.log(`| ✅ Passed | ${passed} |`);
  console.log(`| ❌ Failed | ${failed} |`);
  console.log(`| ⏭️ Skipped | ${skipped} |`);
  console.log(`| ⚠️ No Tool | ${noTool} |`);
  console.log(`| **Total** | ${results.length} |`);
  console.log();
  console.log('## Results by Agent\n');
  
  for (const agent of AGENTS) {
    console.log(`### ${agent.name}\n`);
    console.log('| Capability | Result | Tools Called | Notes |');
    console.log('|------------|--------|--------------|-------|');
    for (const r of results.filter(x => x.agentId === agent.id)) {
      const icon = r.result === 'PASS' ? '✅' : r.result === 'FAIL' ? '❌' : r.result === 'NO_TOOL' ? '⚠️' : '⏭️';
      const tools = r.toolsCalled?.join(', ') || '-';
      const notes = r.explanation || r.error || '-';
      console.log(`| ${r.name} | ${icon} ${r.result} | ${tools} | ${notes.substring(0,50)} |`);
    }
    console.log();
  }
  console.log('```');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
