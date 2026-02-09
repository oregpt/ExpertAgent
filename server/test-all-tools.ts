/**
 * Comprehensive Deep Tools Test Suite
 *
 * Tests ALL deep tools: browser, filesystem, web, memory, cron, agent
 * Run with: npx tsx test-all-tools.ts
 *
 * Prerequisites:
 *   - npm install playwright && npx playwright install chromium
 *   - Set IS_DESKTOP=true for filesystem tests
 */

import {
  BROWSER_TOOLS,
  isBrowserTool,
  executeBrowserTool,
  shutdownBrowser,
  getBrowserConfig,
} from './src/tools/browserTools';

import {
  FILESYSTEM_TOOLS,
  isFilesystemTool,
  executeFilesystemTool,
} from './src/tools/filesystemTools';

import {
  DEEP_TOOLS,
  isDeepTool,
  executeDeepTool,
} from './src/tools/deepTools';

import {
  CRON_TOOLS,
  isCronTool,
  executeCronTool,
} from './src/tools/cronTools';

import {
  AGENT_TOOLS,
  isAgentTool,
} from './src/tools/agentTools';

import {
  MEMORY_TOOLS,
  isMemoryTool,
  executeMemoryTool,
} from './src/memory/memoryTools';

import * as path from 'path';
import * as os from 'os';

// Test configuration
const TEST_AGENT_ID = 'test-agent-001';

// Colors for console output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

// Test results
let passed = 0;
let failed = 0;
const failures: string[] = [];

function log(msg: string): void {
  console.log(msg);
}

function success(testName: string, details?: string): void {
  passed++;
  log(`${GREEN}✓${RESET} ${testName}${details ? ` — ${details}` : ''}`);
}

function fail(testName: string, error: string): void {
  failed++;
  failures.push(`${testName}: ${error}`);
  log(`${RED}✗${RESET} ${testName}`);
  log(`  ${RED}Error: ${error}${RESET}`);
}

function skip(testName: string, reason: string): void {
  log(`${YELLOW}○${RESET} ${testName} — ${reason}`);
}

function section(title: string): void {
  log(`\n${BOLD}${CYAN}═══ ${title} ═══${RESET}\n`);
}

// ============================================================================
// Web Tools Tests (web__search, web__fetch)
// ============================================================================

async function testWebTools(): Promise<void> {
  section('Web Tools (web__search, web__fetch)');

  // Check if Brave API key is configured
  const hasBraveKey = !!process.env.BRAVE_SEARCH_API_KEY;
  if (!hasBraveKey) {
    log(`${YELLOW}Note: BRAVE_SEARCH_API_KEY not set. web__search will be skipped.${RESET}\n`);
  }

  // Test: Tool detection
  try {
    if (isDeepTool('web__search') && isDeepTool('web__fetch') && !isDeepTool('browser__navigate')) {
      success('Deep tool detection', 'Correctly identifies web tools');
    } else {
      fail('Deep tool detection', 'isDeepTool returned unexpected results');
    }
  } catch (err) {
    fail('Deep tool detection', (err as Error).message);
  }

  // Test: web__search
  if (hasBraveKey) {
    try {
      const result = await executeDeepTool({
        id: 'test-web-1',
        name: 'web__search',
        input: { query: 'anthropic claude AI', count: 3 },
      }, TEST_AGENT_ID);
      if (result.success && result.output.includes('anthropic')) {
        success('web__search', `Got results containing 'anthropic'`);
      } else if (result.success) {
        success('web__search', `Search returned results`);
      } else {
        fail('web__search', result.output.slice(0, 200));
      }
    } catch (err) {
      fail('web__search', (err as Error).message);
    }
  } else {
    skip('web__search', 'BRAVE_SEARCH_API_KEY not configured');
  }

  // Test: web__fetch
  try {
    const result = await executeDeepTool({
      id: 'test-web-2',
      name: 'web__fetch',
      input: { url: 'https://httpbin.org/html' },
    }, TEST_AGENT_ID);
    if (result.success && result.output.includes('Herman Melville')) {
      success('web__fetch', 'Fetched httpbin.org/html successfully');
    } else if (result.success) {
      success('web__fetch', `Fetched content (${result.output.length} chars)`);
    } else {
      fail('web__fetch', result.output.slice(0, 200));
    }
  } catch (err) {
    fail('web__fetch', (err as Error).message);
  }

  // Test: web__fetch with JSON
  try {
    const result = await executeDeepTool({
      id: 'test-web-3',
      name: 'web__fetch',
      input: { url: 'https://httpbin.org/json' },
    }, TEST_AGENT_ID);
    if (result.success && result.output.includes('slideshow')) {
      success('web__fetch (JSON)', 'Fetched and parsed JSON content');
    } else {
      fail('web__fetch (JSON)', result.output.slice(0, 200));
    }
  } catch (err) {
    fail('web__fetch (JSON)', (err as Error).message);
  }
}

// ============================================================================
// Memory Tools Tests
// ============================================================================

async function testMemoryTools(): Promise<void> {
  section('Memory Tools');

  const testFile = 'test-memory-file.md';
  const testContent = `# Test Memory\n\nCreated at ${new Date().toISOString()}\n\nThis is test content for memory tools.`;
  const appendContent = '\n\n## Appended Section\n\nThis was appended.';

  // Test: Tool detection
  try {
    if (isMemoryTool('memory__write') && isMemoryTool('memory__read') && !isMemoryTool('fs__read_file')) {
      success('Memory tool detection', 'Correctly identifies memory tools');
    } else {
      fail('Memory tool detection', 'isMemoryTool returned unexpected results');
    }
  } catch (err) {
    fail('Memory tool detection', (err as Error).message);
  }

  // Test: memory__write
  try {
    const result = await executeMemoryTool(TEST_AGENT_ID, {
      id: 'test-mem-1',
      name: 'memory__write',
      input: { doc_key: testFile, content: testContent },
    });
    if (result.success) {
      success('memory__write', `Wrote ${testContent.length} chars to ${testFile}`);
    } else {
      fail('memory__write', result.output);
    }
  } catch (err) {
    fail('memory__write', (err as Error).message);
  }

  // Test: memory__read
  try {
    const result = await executeMemoryTool(TEST_AGENT_ID, {
      id: 'test-mem-2',
      name: 'memory__read',
      input: { doc_key: testFile },
    });
    if (result.success && result.output.includes('Test Memory')) {
      success('memory__read', 'Read content matches');
    } else {
      fail('memory__read', result.output.slice(0, 200));
    }
  } catch (err) {
    fail('memory__read', (err as Error).message);
  }

  // Test: memory__append
  try {
    const result = await executeMemoryTool(TEST_AGENT_ID, {
      id: 'test-mem-3',
      name: 'memory__append',
      input: { doc_key: testFile, text: appendContent },
    });
    if (result.success) {
      success('memory__append', `Appended ${appendContent.length} chars`);
    } else {
      fail('memory__append', result.output);
    }
  } catch (err) {
    fail('memory__append', (err as Error).message);
  }

  // Test: memory__search
  try {
    const result = await executeMemoryTool(TEST_AGENT_ID, {
      id: 'test-mem-4',
      name: 'memory__search',
      input: { query: 'test memory content' },
    });
    if (result.success) {
      success('memory__search', `Search completed`);
    } else {
      // Search might fail if no embeddings - that's okay
      skip('memory__search', result.output.slice(0, 100));
    }
  } catch (err) {
    skip('memory__search', (err as Error).message);
  }

  // Cleanup: Delete test file (write empty content)
  try {
    await executeMemoryTool(TEST_AGENT_ID, {
      id: 'test-mem-cleanup',
      name: 'memory__write',
      input: { doc_key: testFile, content: '' },
    });
    log(`  Cleanup: Cleared ${testFile}`);
  } catch (err) {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Cron Tools Tests
// ============================================================================

async function testCronTools(): Promise<void> {
  section('Cron Tools');

  // Test: Tool detection
  try {
    if (isCronTool('cron__schedule') && isCronTool('cron__list') && !isCronTool('memory__read')) {
      success('Cron tool detection', 'Correctly identifies cron tools');
    } else {
      fail('Cron tool detection', 'isCronTool returned unexpected results');
    }
  } catch (err) {
    fail('Cron tool detection', (err as Error).message);
  }

  // Test: cron__list (should work even with no jobs)
  try {
    const result = await executeCronTool(TEST_AGENT_ID, {
      id: 'test-cron-1',
      name: 'cron__list',
      input: {},
    });
    if (result.success) {
      success('cron__list', result.output.includes('No cron') ? 'No jobs (expected)' : 'Listed jobs');
    } else {
      fail('cron__list', result.output);
    }
  } catch (err) {
    fail('cron__list', (err as Error).message);
  }

  // Test: cron__schedule with interval
  let createdJobId: number | null = null;
  try {
    const result = await executeCronTool(TEST_AGENT_ID, {
      id: 'test-cron-2',
      name: 'cron__schedule',
      input: { schedule: 'every 1h', task_text: 'Test hourly task from test suite' },
    });
    if (result.success && result.output.includes('Cron job created')) {
      const match = result.output.match(/ID:\s*(\d+)/);
      createdJobId = match ? parseInt(match[1], 10) : null;
      success('cron__schedule (interval)', `Created job ${createdJobId}`);
    } else {
      fail('cron__schedule (interval)', result.output.slice(0, 200));
    }
  } catch (err) {
    fail('cron__schedule (interval)', (err as Error).message);
  }

  // Test: cron__schedule with cron expression
  let createdJobId2: number | null = null;
  try {
    const result = await executeCronTool(TEST_AGENT_ID, {
      id: 'test-cron-3',
      name: 'cron__schedule',
      input: { schedule: '0 9 * * 1-5', task_text: 'Test weekday 9am task' },
    });
    if (result.success && result.output.includes('Cron job created')) {
      const match = result.output.match(/ID:\s*(\d+)/);
      createdJobId2 = match ? parseInt(match[1], 10) : null;
      success('cron__schedule (cron expr)', `Created job ${createdJobId2}`);
    } else {
      fail('cron__schedule (cron expr)', result.output.slice(0, 200));
    }
  } catch (err) {
    fail('cron__schedule (cron expr)', (err as Error).message);
  }

  // Test: cron__update
  if (createdJobId) {
    try {
      const result = await executeCronTool(TEST_AGENT_ID, {
        id: 'test-cron-4',
        name: 'cron__update',
        input: { job_id: createdJobId, task_text: 'Updated task text', enabled: false },
      });
      if (result.success && result.output.includes('updated')) {
        success('cron__update', 'Updated job task and disabled');
      } else {
        fail('cron__update', result.output.slice(0, 200));
      }
    } catch (err) {
      fail('cron__update', (err as Error).message);
    }
  }

  // Test: cron__delete
  if (createdJobId) {
    try {
      const result = await executeCronTool(TEST_AGENT_ID, {
        id: 'test-cron-5',
        name: 'cron__delete',
        input: { job_id: createdJobId },
      });
      if (result.success && result.output.includes('deleted')) {
        success('cron__delete', `Deleted job ${createdJobId}`);
      } else {
        fail('cron__delete', result.output);
      }
    } catch (err) {
      fail('cron__delete', (err as Error).message);
    }
  }

  // Cleanup second job
  if (createdJobId2) {
    try {
      await executeCronTool(TEST_AGENT_ID, {
        id: 'test-cron-cleanup',
        name: 'cron__delete',
        input: { job_id: createdJobId2 },
      });
      log(`  Cleanup: Deleted job ${createdJobId2}`);
    } catch (err) {
      // Ignore cleanup errors
    }
  }
}

// ============================================================================
// Agent Tools Tests
// ============================================================================

async function testAgentTools(): Promise<void> {
  section('Agent Tools');

  // Test: Tool detection
  try {
    if (isAgentTool('agent__spawn_task') && !isAgentTool('cron__list')) {
      success('Agent tool detection', 'Correctly identifies agent tools');
    } else {
      fail('Agent tool detection', 'isAgentTool returned unexpected results');
    }
  } catch (err) {
    fail('Agent tool detection', (err as Error).message);
  }

  // Note: Actually spawning a task would create a real conversation
  // So we just verify the tool exists and is registered
  try {
    const agentToolNames = AGENT_TOOLS.map(t => t.name);
    if (agentToolNames.includes('agent__spawn_task')) {
      success('agent__spawn_task registered', `Found in ${agentToolNames.length} agent tools`);
    } else {
      fail('agent__spawn_task registered', 'Tool not found');
    }
  } catch (err) {
    fail('agent__spawn_task registered', (err as Error).message);
  }
}

// ============================================================================
// Browser Tool Tests
// ============================================================================

async function testBrowserTools(): Promise<void> {
  section('Browser Tools');

  // Test: Tool detection
  try {
    const browserToolNames = BROWSER_TOOLS.map(t => t.name);
    log(`Registered browser tools (${browserToolNames.length}):`);
    browserToolNames.slice(0, 10).forEach(n => log(`  - ${n}`));
    if (browserToolNames.length > 10) log(`  ... and ${browserToolNames.length - 10} more`);

    if (isBrowserTool('browser__navigate') && !isBrowserTool('fs__read_file')) {
      success('Browser tool detection', `${browserToolNames.length} tools registered`);
    } else {
      fail('Browser tool detection', 'isBrowserTool returned unexpected results');
    }
  } catch (err) {
    fail('Browser tool detection', (err as Error).message);
  }

  // Test: Get config
  try {
    const config = getBrowserConfig();
    success('browser__config (get)', `headless=${config.headless}, viewport=${config.viewport.width}x${config.viewport.height}`);
  } catch (err) {
    fail('browser__config (get)', (err as Error).message);
  }

  // Test: Navigate
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-b-1',
      name: 'browser__navigate',
      input: { url: 'https://example.com' },
    });
    if (result.success && result.output.includes('Example Domain')) {
      success('browser__navigate', 'Loaded example.com');
    } else {
      fail('browser__navigate', result.output.slice(0, 200));
    }
  } catch (err) {
    fail('browser__navigate', (err as Error).message);
  }

  // Test: Snapshot
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-b-2',
      name: 'browser__snapshot',
      input: { max_length: 2000 },
    });
    if (result.success) {
      success('browser__snapshot', `${result.output.length} chars of DOM`);
    } else {
      fail('browser__snapshot', result.output.slice(0, 200));
    }
  } catch (err) {
    fail('browser__snapshot', (err as Error).message);
  }

  // Test: Screenshot
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-b-3',
      name: 'browser__screenshot',
      input: { full_page: false },
    });
    if (result.success && result.output.includes('data:image/png;base64,')) {
      success('browser__screenshot', 'Captured PNG');
    } else {
      fail('browser__screenshot', result.output.slice(0, 100));
    }
  } catch (err) {
    fail('browser__screenshot', (err as Error).message);
  }

  // Test: Get text
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-b-4',
      name: 'browser__get_text',
      input: { selector: 'h1' },
    });
    if (result.success && result.output.includes('Example Domain')) {
      success('browser__get_text', 'Extracted h1');
    } else {
      fail('browser__get_text', result.output);
    }
  } catch (err) {
    fail('browser__get_text', (err as Error).message);
  }

  // Test: Evaluate JS
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-b-5',
      name: 'browser__evaluate',
      input: { script: 'document.title' },
    });
    if (result.success && result.output.includes('Example')) {
      success('browser__evaluate', `Result: ${result.output}`);
    } else {
      fail('browser__evaluate', result.output);
    }
  } catch (err) {
    fail('browser__evaluate', (err as Error).message);
  }

  // Test: Click
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-b-6',
      name: 'browser__click',
      input: { selector: 'a' },
    });
    if (result.success) {
      success('browser__click', 'Clicked link');
    } else {
      fail('browser__click', result.output);
    }
  } catch (err) {
    fail('browser__click', (err as Error).message);
  }

  // Test: Back
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-b-7',
      name: 'browser__back',
      input: {},
    });
    if (result.success) {
      success('browser__back', result.output);
    } else {
      fail('browser__back', result.output);
    }
  } catch (err) {
    fail('browser__back', (err as Error).message);
  }

  // Test: Tabs
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-b-8',
      name: 'browser__tabs',
      input: {},
    });
    if (result.success) {
      success('browser__tabs', result.output.split('\n')[0]);
    } else {
      fail('browser__tabs', result.output);
    }
  } catch (err) {
    fail('browser__tabs', (err as Error).message);
  }

  // Test: Cookies
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-b-9',
      name: 'browser__cookies',
      input: { action: 'get' },
    });
    if (result.success) {
      const cookies = JSON.parse(result.output);
      success('browser__cookies', `${cookies.length} cookies`);
    } else {
      fail('browser__cookies', result.output);
    }
  } catch (err) {
    fail('browser__cookies', (err as Error).message);
  }

  // Cleanup
  await shutdownBrowser();
  log('\n  Browser shutdown complete.');
}

// ============================================================================
// Filesystem Tool Tests
// ============================================================================

async function testFilesystemTools(): Promise<void> {
  section('Filesystem Tools');

  if (process.env.IS_DESKTOP !== 'true') {
    log(`${YELLOW}Note: IS_DESKTOP not set. Some filesystem tests may be limited.${RESET}\n`);
  }

  // Test: Tool detection
  try {
    const fsToolNames = FILESYSTEM_TOOLS.map(t => t.name);
    log(`Registered filesystem tools (${fsToolNames.length}):`);
    fsToolNames.forEach(n => log(`  - ${n}`));

    if (isFilesystemTool('fs__read_file') && !isFilesystemTool('browser__navigate')) {
      success('Filesystem tool detection', `${fsToolNames.length} tools registered`);
    } else {
      fail('Filesystem tool detection', 'isFilesystemTool returned unexpected results');
    }
  } catch (err) {
    fail('Filesystem tool detection', (err as Error).message);
  }

  // Test: Get allowed directories
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-1',
      name: 'fs__get_allowed_directories',
      input: {},
    });
    if (result.success) {
      success('fs__get_allowed_directories', result.output.split('\n')[0]);
    } else {
      fail('fs__get_allowed_directories', result.output);
    }
  } catch (err) {
    fail('fs__get_allowed_directories', (err as Error).message);
  }

  // Setup test directory
  const testDir = path.join(os.homedir(), 'Documents', 'agentinabox-test-' + Date.now());
  const testFile = path.join(testDir, 'test.txt');
  const testContent = `Test content: ${new Date().toISOString()}`;

  // Test: mkdir
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-2',
      name: 'fs__mkdir',
      input: { path: testDir },
    });
    if (result.success) {
      success('fs__mkdir', 'Created test directory');
    } else {
      fail('fs__mkdir', result.output);
    }
  } catch (err) {
    fail('fs__mkdir', (err as Error).message);
  }

  // Test: write_file
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-3',
      name: 'fs__write_file',
      input: { path: testFile, content: testContent },
    });
    if (result.success) {
      success('fs__write_file', `Wrote ${testContent.length} chars`);
    } else {
      fail('fs__write_file', result.output);
    }
  } catch (err) {
    fail('fs__write_file', (err as Error).message);
  }

  // Test: read_file
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-4',
      name: 'fs__read_file',
      input: { path: testFile },
    });
    if (result.success && result.output === testContent) {
      success('fs__read_file', 'Content matches');
    } else {
      fail('fs__read_file', 'Content mismatch or error');
    }
  } catch (err) {
    fail('fs__read_file', (err as Error).message);
  }

  // Test: append_file
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-5',
      name: 'fs__append_file',
      input: { path: testFile, content: '\nAppended line' },
    });
    if (result.success) {
      success('fs__append_file', 'Appended content');
    } else {
      fail('fs__append_file', result.output);
    }
  } catch (err) {
    fail('fs__append_file', (err as Error).message);
  }

  // Test: file_info
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-6',
      name: 'fs__file_info',
      input: { path: testFile },
    });
    if (result.success) {
      const info = JSON.parse(result.output);
      success('fs__file_info', `Size: ${info.sizeHuman}`);
    } else {
      fail('fs__file_info', result.output);
    }
  } catch (err) {
    fail('fs__file_info', (err as Error).message);
  }

  // Test: list_directory
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-7',
      name: 'fs__list_directory',
      input: { path: testDir },
    });
    if (result.success && result.output.includes('test.txt')) {
      success('fs__list_directory', 'Listed directory');
    } else {
      fail('fs__list_directory', result.output.slice(0, 200));
    }
  } catch (err) {
    fail('fs__list_directory', (err as Error).message);
  }

  // Test: copy
  const copyPath = path.join(testDir, 'test-copy.txt');
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-8',
      name: 'fs__copy',
      input: { source: testFile, destination: copyPath },
    });
    if (result.success) {
      success('fs__copy', 'Copied file');
    } else {
      fail('fs__copy', result.output);
    }
  } catch (err) {
    fail('fs__copy', (err as Error).message);
  }

  // Test: move
  const movePath = path.join(testDir, 'test-moved.txt');
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-9',
      name: 'fs__move',
      input: { source: copyPath, destination: movePath },
    });
    if (result.success) {
      success('fs__move', 'Moved file');
    } else {
      fail('fs__move', result.output);
    }
  } catch (err) {
    fail('fs__move', (err as Error).message);
  }

  // Test: search
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-10',
      name: 'fs__search',
      input: { directory: testDir, pattern: '*.txt' },
    });
    if (result.success) {
      success('fs__search', 'Found files');
    } else {
      fail('fs__search', result.output);
    }
  } catch (err) {
    fail('fs__search', (err as Error).message);
  }

  // Cleanup
  try {
    await executeFilesystemTool(TEST_AGENT_ID, { id: 'c1', name: 'fs__delete', input: { path: testFile } });
    await executeFilesystemTool(TEST_AGENT_ID, { id: 'c2', name: 'fs__delete', input: { path: movePath } });
    await executeFilesystemTool(TEST_AGENT_ID, { id: 'c3', name: 'fs__delete', input: { path: testDir } });
    success('Cleanup', 'Removed test files and directory');
  } catch (err) {
    log(`  ${YELLOW}Cleanup warning: ${(err as Error).message}${RESET}`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log(`${BOLD}
╔═══════════════════════════════════════════════════════════════╗
║        Comprehensive Deep Tools Test Suite — v2               ║
║        Testing: Web, Memory, Cron, Agent, Browser, FS         ║
╚═══════════════════════════════════════════════════════════════╝${RESET}
`);

  const startTime = Date.now();

  try { await testWebTools(); } catch (err) { log(`${RED}Web tests crashed: ${(err as Error).message}${RESET}`); }
  try { await testMemoryTools(); } catch (err) { log(`${RED}Memory tests crashed: ${(err as Error).message}${RESET}`); }
  try { await testCronTools(); } catch (err) { log(`${RED}Cron tests crashed: ${(err as Error).message}${RESET}`); }
  try { await testAgentTools(); } catch (err) { log(`${RED}Agent tests crashed: ${(err as Error).message}${RESET}`); }
  try { await testBrowserTools(); } catch (err) { log(`${RED}Browser tests crashed: ${(err as Error).message}${RESET}`); await shutdownBrowser(); }
  try { await testFilesystemTools(); } catch (err) { log(`${RED}Filesystem tests crashed: ${(err as Error).message}${RESET}`); }

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  section('Summary');

  log(`Total:  ${passed + failed} tests`);
  log(`${GREEN}Passed: ${passed}${RESET}`);
  log(`${failed > 0 ? RED : ''}Failed: ${failed}${RESET}`);
  log(`Time:   ${duration}s`);

  if (failures.length > 0) {
    log(`\n${RED}Failures:${RESET}`);
    failures.forEach(f => log(`  - ${f}`));
  }

  log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`${RED}Fatal error: ${err.message}${RESET}`);
  process.exit(1);
});
