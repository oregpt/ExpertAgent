import { db } from './src/db/client';
import { capabilities, agentCapabilities, capabilityTokens } from './src/db/schema';
import { eq, and } from 'drizzle-orm';
import { getMCPServerManager } from './src/mcp-hub/mcp-server-manager';

interface TestResult {
  capability: string;
  capabilityName: string;
  agent: string;
  agentId: string;
  serverName: string;
  hasToken: boolean;
  toolCount: number;
  testCall: string;
  result: 'PASS' | 'FAIL' | 'SKIP';
  response?: any;
  error?: string;
  explanation?: string;
}

const TEST_CALLS: Record<string, { tool: string; args: Record<string, any> }> = {
  'sec-edgar': { tool: 'get_company_tickers', args: {} },
  'bitwave-price': { tool: 'get_supported_tokens', args: {} },
  'binanceus': { tool: 'get_ticker_price', args: { symbol: 'BTCUSDT' } },
  'thetie-canton': { tool: 'list_agents', args: {} },
  'slack': { tool: 'slack_list_channels', args: {} },
  'kaiko': { tool: 'get_instruments', args: {} },
  'kraken': { tool: 'get_ticker', args: { pair: 'XBTUSD' } },
  'plaid': { tool: 'get_institutions', args: { count: 1 } },
  'gamma': { tool: 'health_check', args: {} },
  'google-calendar': { tool: 'list_calendars', args: {} },
  'gmail': { tool: 'list_labels', args: {} },
  'wallet-balance': { tool: 'get_balance', args: { address: '0x0000000000000000000000000000000000000000', chain: 'ethereum' } },
  'mcp-lighthouse': { tool: 'price_get', args: {} },
  'mcp-ccview': { tool: 'get_daml_parties', args: {} },
};

async function main() {
  const results: TestResult[] = [];
  
  // Get all capabilities
  const allCaps = await db.select().from(capabilities);
  
  // Get agent capabilities
  const defaultAgentCaps = await db.select().from(agentCapabilities).where(eq(agentCapabilities.agentId, 'default-agent'));
  const financeAgentCaps = await db.select().from(agentCapabilities).where(eq(agentCapabilities.agentId, 'agent-1770259052719-vvcqgp'));
  
  // Get tokens
  const allTokens = await db.select().from(capabilityTokens);
  
  console.log('='.repeat(80));
  console.log('MCP CAPABILITY TEST REPORT');
  console.log('Generated:', new Date().toISOString());
  console.log('='.repeat(80));
  
  // Initialize MCP server manager
  const mcpManager = getMCPServerManager();
  
  // Test each agent's capabilities
  const agentConfigs = [
    { name: 'default-agent', id: 'default-agent', caps: defaultAgentCaps },
    { name: 'Finance Assistant', id: 'agent-1770259052719-vvcqgp', caps: financeAgentCaps }
  ];
  
  for (const agent of agentConfigs) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`AGENT: ${agent.name} (${agent.id})`);
    console.log(`${'─'.repeat(80)}`);
    
    for (const agentCap of agent.caps) {
      const cap = allCaps.find(c => c.id === agentCap.capabilityId);
      if (!cap) continue;
      
      const serverName = (cap.config as any)?.serverName || cap.id;
      const hasToken = allTokens.some(t => t.agentId === agent.id && t.capabilityId === agentCap.capabilityId);
      
      const result: TestResult = {
        capability: cap.id,
        capabilityName: cap.name,
        agent: agent.name,
        agentId: agent.id,
        serverName,
        hasToken,
        toolCount: 0,
        testCall: '',
        result: 'SKIP',
        explanation: ''
      };
      
      // Check if enabled
      if (!agentCap.enabled) {
        result.result = 'SKIP';
        result.explanation = 'Capability disabled for this agent';
        results.push(result);
        console.log(`\n[SKIP] ${cap.name} (${cap.id}) - Disabled`);
        continue;
      }
      
      // Try to get tools from the MCP server
      try {
        const tools = await mcpManager.getToolsForServer(serverName);
        result.toolCount = tools?.length || 0;
        
        if (result.toolCount === 0) {
          result.result = 'FAIL';
          result.explanation = `No tools found for server '${serverName}' - server may not be configured in mcp-config.json`;
          results.push(result);
          console.log(`\n[FAIL] ${cap.name} (${cap.id})`);
          console.log(`       Server: ${serverName}`);
          console.log(`       Tools: 0 - Server not configured or not responding`);
          continue;
        }
        
        console.log(`\n[TEST] ${cap.name} (${cap.id})`);
        console.log(`       Server: ${serverName}`);
        console.log(`       Tools: ${result.toolCount}`);
        console.log(`       Token: ${hasToken ? 'YES' : 'NO'}`);
        
        // Try to make a test call
        const testConfig = TEST_CALLS[serverName] || TEST_CALLS[cap.id];
        if (testConfig) {
          result.testCall = `${testConfig.tool}(${JSON.stringify(testConfig.args)})`;
          console.log(`       Test: ${result.testCall}`);
          
          try {
            const response = await mcpManager.callTool(serverName, testConfig.tool, testConfig.args);
            result.response = response;
            result.result = 'PASS';
            console.log(`       Result: PASS`);
            console.log(`       Response: ${JSON.stringify(response).substring(0, 200)}...`);
          } catch (callError: any) {
            result.result = 'FAIL';
            result.error = callError.message;
            result.explanation = `Tool call failed: ${callError.message}`;
            console.log(`       Result: FAIL`);
            console.log(`       Error: ${callError.message}`);
          }
        } else {
          result.testCall = 'No test configured';
          result.result = 'PASS';
          result.explanation = 'Server responds, but no specific test call configured';
          console.log(`       Test: No specific test configured - server is responding`);
          console.log(`       Result: PASS (tools available)`);
        }
      } catch (error: any) {
        result.result = 'FAIL';
        result.error = error.message;
        result.explanation = `Failed to connect to MCP server: ${error.message}`;
        console.log(`\n[FAIL] ${cap.name} (${cap.id})`);
        console.log(`       Server: ${serverName}`);
        console.log(`       Error: ${error.message}`);
      }
      
      results.push(result);
    }
  }
  
  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(80)}`);
  
  const passed = results.filter(r => r.result === 'PASS').length;
  const failed = results.filter(r => r.result === 'FAIL').length;
  const skipped = results.filter(r => r.result === 'SKIP').length;
  
  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${skipped}`);
  
  console.log(`\n${'─'.repeat(80)}`);
  console.log('FAILURES:');
  for (const r of results.filter(r => r.result === 'FAIL')) {
    console.log(`  - ${r.capabilityName} (${r.capability}) on ${r.agent}`);
    console.log(`    Reason: ${r.explanation || r.error}`);
  }
  
  // Output JSON for further processing
  console.log(`\n${'='.repeat(80)}`);
  console.log('JSON OUTPUT:');
  console.log(JSON.stringify(results, null, 2));
}

main().then(() => process.exit(0)).catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
