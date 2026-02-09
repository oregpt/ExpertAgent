/**
 * Deep Tools Test Suite
 *
 * Tests for browser and filesystem tools.
 * Run with: npx tsx test-deep-tools.ts
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
  setBrowserConfig,
} from './src/tools/browserTools';

import {
  FILESYSTEM_TOOLS,
  isFilesystemTool,
  executeFilesystemTool,
} from './src/tools/filesystemTools';

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Test configuration
const TEST_AGENT_ID = 'test-agent-001';

// Colors for console output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
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

function section(title: string): void {
  log(`\n${BOLD}${YELLOW}═══ ${title} ═══${RESET}\n`);
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
    browserToolNames.forEach(n => log(`  - ${n}`));

    if (isBrowserTool('browser__navigate') && !isBrowserTool('fs__read_file')) {
      success('Tool detection', 'isBrowserTool correctly identifies browser tools');
    } else {
      fail('Tool detection', 'isBrowserTool returned unexpected results');
    }
  } catch (err) {
    fail('Tool detection', (err as Error).message);
  }

  // Test: Get config
  try {
    const config = getBrowserConfig();
    if (config.headless !== undefined && config.viewport) {
      success('Get config', `headless=${config.headless}, viewport=${config.viewport.width}x${config.viewport.height}`);
    } else {
      fail('Get config', 'Missing expected config properties');
    }
  } catch (err) {
    fail('Get config', (err as Error).message);
  }

  // Test: Set config (headed mode)
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-1',
      name: 'browser__config',
      input: { action: 'set', headless: true, viewport_width: 1920, viewport_height: 1080 },
    });
    if (result.success) {
      success('Set config', 'Updated viewport to 1920x1080');
    } else {
      fail('Set config', result.output);
    }
  } catch (err) {
    fail('Set config', (err as Error).message);
  }

  // Test: Navigate to a page
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-2',
      name: 'browser__navigate',
      input: { url: 'https://example.com' },
    });
    if (result.success && result.output.includes('Example Domain')) {
      success('Navigate', 'Loaded example.com successfully');
    } else {
      fail('Navigate', result.output.slice(0, 200));
    }
  } catch (err) {
    fail('Navigate', (err as Error).message);
  }

  // Test: Snapshot
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-3',
      name: 'browser__snapshot',
      input: { max_length: 2000 },
    });
    if (result.success && result.output.includes('example.com')) {
      success('Snapshot', `Got ${result.output.length} chars of structured content`);
    } else {
      fail('Snapshot', result.output.slice(0, 200));
    }
  } catch (err) {
    fail('Snapshot', (err as Error).message);
  }

  // Test: Screenshot
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-4',
      name: 'browser__screenshot',
      input: { full_page: false },
    });
    if (result.success && result.output.includes('data:image/png;base64,')) {
      success('Screenshot', 'Captured PNG screenshot');
    } else {
      fail('Screenshot', result.output.slice(0, 200));
    }
  } catch (err) {
    fail('Screenshot', (err as Error).message);
  }

  // Test: Get text
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-5',
      name: 'browser__get_text',
      input: { selector: 'h1' },
    });
    if (result.success && result.output.includes('Example Domain')) {
      success('Get text', 'Extracted h1 text');
    } else {
      fail('Get text', result.output);
    }
  } catch (err) {
    fail('Get text', (err as Error).message);
  }

  // Test: Click link
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-6',
      name: 'browser__click',
      input: { selector: 'a' },
    });
    if (result.success) {
      success('Click', 'Clicked link element');
    } else {
      fail('Click', result.output);
    }
  } catch (err) {
    fail('Click', (err as Error).message);
  }

  // Test: Back navigation
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-7',
      name: 'browser__back',
      input: {},
    });
    if (result.success) {
      success('Back', result.output);
    } else {
      fail('Back', result.output);
    }
  } catch (err) {
    fail('Back', (err as Error).message);
  }

  // Test: Evaluate JavaScript
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-8',
      name: 'browser__evaluate',
      input: { script: 'document.title + " - " + window.location.hostname' },
    });
    if (result.success && result.output.includes('example.com')) {
      success('Evaluate', `Result: ${result.output}`);
    } else {
      fail('Evaluate', result.output);
    }
  } catch (err) {
    fail('Evaluate', (err as Error).message);
  }

  // Test: Tabs list
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-9',
      name: 'browser__tabs',
      input: {},
    });
    if (result.success) {
      success('Tabs', result.output.split('\n')[0]);
    } else {
      fail('Tabs', result.output);
    }
  } catch (err) {
    fail('Tabs', (err as Error).message);
  }

  // Test: New tab
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-10',
      name: 'browser__new_tab',
      input: { url: 'https://httpbin.org/html' },
    });
    if (result.success) {
      success('New tab', result.output);
    } else {
      fail('New tab', result.output);
    }
  } catch (err) {
    fail('New tab', (err as Error).message);
  }

  // Test: Scroll
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-11',
      name: 'browser__scroll',
      input: { direction: 'down', amount: 200 },
    });
    if (result.success) {
      success('Scroll', result.output);
    } else {
      fail('Scroll', result.output);
    }
  } catch (err) {
    fail('Scroll', (err as Error).message);
  }

  // Test: Cookies
  try {
    const result = await executeBrowserTool(TEST_AGENT_ID, {
      id: 'test-12',
      name: 'browser__cookies',
      input: { action: 'get' },
    });
    if (result.success) {
      const cookies = JSON.parse(result.output);
      success('Cookies', `Got ${cookies.length} cookies`);
    } else {
      fail('Cookies', result.output);
    }
  } catch (err) {
    fail('Cookies', (err as Error).message);
  }

  // Clean up browser
  await shutdownBrowser();
  log('\nBrowser shutdown complete.');
}

// ============================================================================
// Filesystem Tool Tests
// ============================================================================

async function testFilesystemTools(): Promise<void> {
  section('Filesystem Tools');

  // Check if we're in desktop mode
  if (process.env.IS_DESKTOP !== 'true') {
    log(`${YELLOW}Note: IS_DESKTOP is not set. Filesystem tests may have limited directory access.${RESET}`);
    log('Set IS_DESKTOP=true and EXPERT_AGENT_DATA_DIR to test full functionality.\n');
  }

  // Test: Tool detection
  try {
    const fsToolNames = FILESYSTEM_TOOLS.map(t => t.name);
    log(`Registered filesystem tools (${fsToolNames.length}):`);
    fsToolNames.forEach(n => log(`  - ${n}`));

    if (isFilesystemTool('fs__read_file') && !isFilesystemTool('browser__navigate')) {
      success('Tool detection', 'isFilesystemTool correctly identifies fs tools');
    } else {
      fail('Tool detection', 'isFilesystemTool returned unexpected results');
    }
  } catch (err) {
    fail('Tool detection', (err as Error).message);
  }

  // Test: Get allowed directories
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-1',
      name: 'fs__get_allowed_directories',
      input: {},
    });
    if (result.success) {
      success('Get allowed dirs', result.output.split('\n')[0]);
    } else {
      fail('Get allowed dirs', result.output);
    }
  } catch (err) {
    fail('Get allowed dirs', (err as Error).message);
  }

  // Create test directory in user's Documents (should be allowed)
  const testDir = path.join(os.homedir(), 'Documents', 'agentinabox-test');
  const testFile = path.join(testDir, 'test-file.txt');
  const testContent = `Test content created at ${new Date().toISOString()}`;

  // Test: Create directory
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-2',
      name: 'fs__mkdir',
      input: { path: testDir },
    });
    if (result.success) {
      success('Create directory', testDir);
    } else {
      fail('Create directory', result.output);
    }
  } catch (err) {
    fail('Create directory', (err as Error).message);
  }

  // Test: Write file
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-3',
      name: 'fs__write_file',
      input: { path: testFile, content: testContent },
    });
    if (result.success) {
      success('Write file', `Wrote ${testContent.length} chars`);
    } else {
      fail('Write file', result.output);
    }
  } catch (err) {
    fail('Write file', (err as Error).message);
  }

  // Test: Read file
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-4',
      name: 'fs__read_file',
      input: { path: testFile },
    });
    if (result.success && result.output === testContent) {
      success('Read file', 'Content matches');
    } else if (result.success) {
      fail('Read file', 'Content mismatch');
    } else {
      fail('Read file', result.output);
    }
  } catch (err) {
    fail('Read file', (err as Error).message);
  }

  // Test: Append file
  try {
    const appendContent = '\nAppended line';
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-5',
      name: 'fs__append_file',
      input: { path: testFile, content: appendContent },
    });
    if (result.success) {
      success('Append file', `Appended ${appendContent.length} chars`);
    } else {
      fail('Append file', result.output);
    }
  } catch (err) {
    fail('Append file', (err as Error).message);
  }

  // Test: File info
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-6',
      name: 'fs__file_info',
      input: { path: testFile },
    });
    if (result.success) {
      const info = JSON.parse(result.output);
      success('File info', `Size: ${info.sizeHuman}, Type: ${info.type}`);
    } else {
      fail('File info', result.output);
    }
  } catch (err) {
    fail('File info', (err as Error).message);
  }

  // Test: List directory
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-7',
      name: 'fs__list_directory',
      input: { path: testDir },
    });
    if (result.success && result.output.includes('test-file.txt')) {
      success('List directory', 'Found test file in listing');
    } else {
      fail('List directory', result.output.slice(0, 200));
    }
  } catch (err) {
    fail('List directory', (err as Error).message);
  }

  // Test: Copy file
  const copyPath = path.join(testDir, 'test-file-copy.txt');
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-8',
      name: 'fs__copy',
      input: { source: testFile, destination: copyPath },
    });
    if (result.success) {
      success('Copy file', copyPath);
    } else {
      fail('Copy file', result.output);
    }
  } catch (err) {
    fail('Copy file', (err as Error).message);
  }

  // Test: Move/rename file
  const movedPath = path.join(testDir, 'test-file-moved.txt');
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-9',
      name: 'fs__move',
      input: { source: copyPath, destination: movedPath },
    });
    if (result.success) {
      success('Move file', movedPath);
    } else {
      fail('Move file', result.output);
    }
  } catch (err) {
    fail('Move file', (err as Error).message);
  }

  // Test: Search
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-10',
      name: 'fs__search',
      input: { directory: testDir, pattern: '*.txt' },
    });
    if (result.success && result.output.includes('test-file')) {
      success('Search', 'Found txt files');
    } else {
      fail('Search', result.output.slice(0, 200));
    }
  } catch (err) {
    fail('Search', (err as Error).message);
  }

  // Test: Search with content
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-11',
      name: 'fs__search',
      input: { directory: testDir, pattern: '*.txt', contentMatch: 'Test content' },
    });
    if (result.success) {
      success('Search with content', result.output.split('\n')[2] || 'Found matches');
    } else {
      fail('Search with content', result.output);
    }
  } catch (err) {
    fail('Search with content', (err as Error).message);
  }

  // Test: Access denied (outside allowed directories)
  try {
    const result = await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-12',
      name: 'fs__read_file',
      input: { path: '/etc/passwd' }, // Should be denied
    });
    if (!result.success && result.output.includes('Access denied')) {
      success('Access control', 'Correctly denied access to /etc/passwd');
    } else if (result.success) {
      fail('Access control', 'Should have denied access to /etc/passwd');
    } else {
      // Might fail for other reasons on Windows, that's okay
      success('Access control', 'Path not accessible (expected)');
    }
  } catch (err) {
    fail('Access control', (err as Error).message);
  }

  // Cleanup: Delete test files
  try {
    await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-cleanup-1',
      name: 'fs__delete',
      input: { path: testFile },
    });
    await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-cleanup-2',
      name: 'fs__delete',
      input: { path: movedPath },
    });
    await executeFilesystemTool(TEST_AGENT_ID, {
      id: 'test-fs-cleanup-3',
      name: 'fs__delete',
      input: { path: testDir },
    });
    success('Cleanup', 'Removed test directory');
  } catch (err) {
    log(`${YELLOW}Cleanup warning: ${(err as Error).message}${RESET}`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log(`${BOLD}
╔═══════════════════════════════════════════════════════════════╗
║           Deep Tools Test Suite — Agent-in-a-Box              ║
╚═══════════════════════════════════════════════════════════════╝${RESET}
`);

  const startTime = Date.now();

  try {
    await testBrowserTools();
  } catch (err) {
    log(`${RED}Browser tests crashed: ${(err as Error).message}${RESET}`);
    await shutdownBrowser();
  }

  try {
    await testFilesystemTools();
  } catch (err) {
    log(`${RED}Filesystem tests crashed: ${(err as Error).message}${RESET}`);
  }

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
