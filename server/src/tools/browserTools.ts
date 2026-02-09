/**
 * Browser Tools
 *
 * Browser automation via Playwright for desktop agents.
 * Provides full web browsing capabilities: navigation, interaction,
 * screenshots, content extraction, and more.
 *
 * Features:
 *   - Headless or headed mode (configurable)
 *   - CDP attachment to user's existing Chrome (advanced)
 *   - Per-agent browser contexts (persistent cookies/sessions)
 *   - Full screenshot and accessibility tree support
 *
 * Requires: playwright (npm install playwright && npx playwright install chromium)
 *
 * Configuration (environment variables):
 *   BROWSER_HEADLESS=false     — Show browser window (default: true)
 *   BROWSER_CDP_URL=...        — Connect to existing Chrome via CDP
 *   BROWSER_SLOW_MO=100        — Slow down actions by ms (for debugging)
 *   BROWSER_TIMEOUT=30000      — Default timeout in ms
 *
 * Gated by the `deepTools` feature flag.
 */

import { Tool, ToolCall } from '../llm/types';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

interface BrowserConfig {
  headless: boolean;
  cdpUrl?: string;
  slowMo: number;
  timeout: number;
  viewport: { width: number; height: number };
}

// ============================================================================
// State
// ============================================================================

// Lazy-loaded Playwright
let pw: typeof import('playwright') | null = null;

// Browser instance (shared across agents unless CDP is used)
let browserInstance: import('playwright').Browser | null = null;

// Per-agent browser contexts and pages
const agentContexts = new Map<string, import('playwright').BrowserContext>();
const agentPages = new Map<string, import('playwright').Page>();

// Current configuration
let currentConfig: BrowserConfig = {
  headless: process.env.BROWSER_HEADLESS !== 'false',
  cdpUrl: process.env.BROWSER_CDP_URL,
  slowMo: parseInt(process.env.BROWSER_SLOW_MO || '0', 10),
  timeout: parseInt(process.env.BROWSER_TIMEOUT || '30000', 10),
  viewport: { width: 1280, height: 720 },
};

// ============================================================================
// Playwright Initialization
// ============================================================================

async function ensurePlaywright(): Promise<typeof import('playwright')> {
  if (pw) return pw;
  try {
    pw = await import('playwright');
    return pw;
  } catch (err) {
    throw new Error(
      'Playwright is not installed. Run: npm install playwright && npx playwright install chromium'
    );
  }
}

/**
 * Get or create the browser instance
 * Supports: local headless/headed, or CDP connection to existing Chrome
 */
async function ensureBrowser(): Promise<import('playwright').Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  const playwright = await ensurePlaywright();

  // Option 1: Connect to existing Chrome via CDP
  if (currentConfig.cdpUrl) {
    try {
      browserInstance = await playwright.chromium.connectOverCDP(currentConfig.cdpUrl);
      console.log(`[browser-tools] Connected to Chrome via CDP: ${currentConfig.cdpUrl}`);
      logger.info('[browser-tools] CDP connection established', { url: currentConfig.cdpUrl });
      return browserInstance;
    } catch (err) {
      console.error(`[browser-tools] CDP connection failed: ${(err as Error).message}`);
      console.log('[browser-tools] Falling back to local browser...');
      // Fall through to local browser
    }
  }

  // Option 2: Launch local browser (headless or headed)
  browserInstance = await playwright.chromium.launch({
    headless: currentConfig.headless,
    slowMo: currentConfig.slowMo,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      ...(currentConfig.headless ? ['--disable-gpu'] : []),
    ],
  });

  const mode = currentConfig.headless ? 'headless' : 'headed';
  console.log(`[browser-tools] Chromium browser launched (${mode})`);
  logger.info('[browser-tools] Browser launched', { mode, slowMo: currentConfig.slowMo });

  return browserInstance;
}

/**
 * Get or create a persistent browser context + page for an agent
 */
async function getAgentPage(agentId: string): Promise<import('playwright').Page> {
  // Return existing page if still open
  const existingPage = agentPages.get(agentId);
  if (existingPage && !existingPage.isClosed()) {
    return existingPage;
  }

  const browser = await ensureBrowser();

  // Get or create context
  let context = agentContexts.get(agentId);
  if (!context || !context.pages) {
    context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      viewport: currentConfig.viewport,
      ignoreHTTPSErrors: true,
      // Enable recording for debugging if not headless
      ...(!currentConfig.headless && {
        recordVideo: undefined, // Can enable if needed
      }),
    });
    agentContexts.set(agentId, context);
    console.log(`[browser-tools] Created browser context for agent ${agentId}`);
  }

  // Create page
  const page = await context.newPage();
  agentPages.set(agentId, page);

  // Set timeouts
  page.setDefaultTimeout(currentConfig.timeout);
  page.setDefaultNavigationTimeout(currentConfig.timeout);

  // Log console messages in headed mode for debugging
  if (!currentConfig.headless) {
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`[browser:console:error] ${msg.text()}`);
      }
    });
  }

  return page;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const BROWSER_TOOLS: Tool[] = [
  // === Configuration ===
  {
    name: 'browser__config',
    description:
      '[browser] Get or set browser configuration. Use to switch between headless/headed mode, connect to CDP, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '"get" to view current config, "set" to update',
          enum: ['get', 'set'],
        },
        headless: {
          type: 'boolean',
          description: 'Run in headless mode (no visible window)',
        },
        cdp_url: {
          type: 'string',
          description: 'Chrome DevTools Protocol URL to connect to existing browser (e.g., http://localhost:9222)',
        },
        viewport_width: {
          type: 'number',
          description: 'Browser viewport width',
        },
        viewport_height: {
          type: 'number',
          description: 'Browser viewport height',
        },
      },
      required: ['action'],
    },
  },

  // === Navigation ===
  {
    name: 'browser__navigate',
    description:
      '[browser] Navigate to a URL. Returns the page title and a text snapshot of visible content.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to navigate to',
        },
        wait_for: {
          type: 'string',
          description: 'Wait condition: "load", "domcontentloaded", or "networkidle" (default: "domcontentloaded")',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser__back',
    description: '[browser] Navigate back in browser history.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser__forward',
    description: '[browser] Navigate forward in browser history.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser__reload',
    description: '[browser] Reload the current page.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // === Interaction ===
  {
    name: 'browser__click',
    description:
      '[browser] Click an element. Supports CSS selectors or text:="visible text" syntax.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector or text:="Button Text"',
        },
        button: {
          type: 'string',
          description: 'Mouse button: "left", "right", or "middle" (default: "left")',
        },
        click_count: {
          type: 'number',
          description: 'Number of clicks (default: 1, use 2 for double-click)',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser__type',
    description:
      '[browser] Type text into an input field. Clears existing content first.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the input',
        },
        text: {
          type: 'string',
          description: 'Text to type',
        },
        press_enter: {
          type: 'boolean',
          description: 'Press Enter after typing',
        },
        delay: {
          type: 'number',
          description: 'Delay between keystrokes in ms (for human-like typing)',
        },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'browser__fill',
    description:
      '[browser] Fill an input field instantly (faster than type). Good for forms.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the input',
        },
        value: {
          type: 'string',
          description: 'Value to fill',
        },
      },
      required: ['selector', 'value'],
    },
  },
  {
    name: 'browser__select',
    description:
      '[browser] Select an option from a dropdown/select element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the select element',
        },
        value: {
          type: 'string',
          description: 'Option value to select',
        },
        label: {
          type: 'string',
          description: 'Option label (visible text) to select',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser__hover',
    description: '[browser] Hover over an element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser__scroll',
    description:
      '[browser] Scroll the page or a specific element.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          description: '"up", "down", "left", "right", or "to_element"',
        },
        amount: {
          type: 'number',
          description: 'Pixels to scroll (default: 500)',
        },
        selector: {
          type: 'string',
          description: 'Scroll to this element (for direction="to_element")',
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'browser__press_key',
    description:
      '[browser] Press a keyboard key (Enter, Tab, Escape, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Key to press (e.g., "Enter", "Tab", "Escape", "ArrowDown", "Control+a")',
        },
        selector: {
          type: 'string',
          description: 'Focus this element first (optional)',
        },
      },
      required: ['key'],
    },
  },

  // === Content Extraction ===
  {
    name: 'browser__screenshot',
    description:
      '[browser] Take a screenshot. Returns base64-encoded PNG.',
    inputSchema: {
      type: 'object',
      properties: {
        full_page: {
          type: 'boolean',
          description: 'Capture full scrollable page',
        },
        selector: {
          type: 'string',
          description: 'Screenshot specific element',
        },
        quality: {
          type: 'number',
          description: 'JPEG quality 0-100 (default: PNG)',
        },
      },
    },
  },
  {
    name: 'browser__snapshot',
    description:
      '[browser] Get structured text snapshot of the page (headings, buttons, inputs, links, content). Much cheaper than screenshots for understanding structure.',
    inputSchema: {
      type: 'object',
      properties: {
        max_length: {
          type: 'number',
          description: 'Max characters (default: 8000)',
        },
        include_attributes: {
          type: 'boolean',
          description: 'Include element IDs and classes',
        },
      },
    },
  },
  {
    name: 'browser__get_text',
    description:
      '[browser] Extract text content from elements matching a selector.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser__get_html',
    description:
      '[browser] Get HTML content of an element or the whole page.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector (optional, defaults to whole page)',
        },
        outer: {
          type: 'boolean',
          description: 'Include the element itself (outerHTML vs innerHTML)',
        },
      },
    },
  },
  {
    name: 'browser__get_attribute',
    description:
      '[browser] Get an attribute value from an element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector',
        },
        attribute: {
          type: 'string',
          description: 'Attribute name (href, src, value, etc.)',
        },
      },
      required: ['selector', 'attribute'],
    },
  },

  // === JavaScript Execution ===
  {
    name: 'browser__evaluate',
    description:
      '[browser] Execute JavaScript in the page context.',
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'JavaScript code to execute',
        },
      },
      required: ['script'],
    },
  },

  // === Waiting ===
  {
    name: 'browser__wait',
    description:
      '[browser] Wait for an element, navigation, or timeout.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'Wait for this element to appear',
        },
        state: {
          type: 'string',
          description: 'Element state: "visible", "hidden", "attached", "detached"',
        },
        timeout_ms: {
          type: 'number',
          description: 'Max wait time in ms',
        },
        navigation: {
          type: 'boolean',
          description: 'Wait for navigation to complete',
        },
      },
    },
  },

  // === Tab Management ===
  {
    name: 'browser__tabs',
    description:
      '[browser] List open tabs/pages in the browser context.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser__new_tab',
    description:
      '[browser] Open a new tab with optional URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to open in new tab',
        },
      },
    },
  },
  {
    name: 'browser__close_tab',
    description:
      '[browser] Close the current tab/page.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // === Cookies & Storage ===
  {
    name: 'browser__cookies',
    description:
      '[browser] Get, set, or clear cookies.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '"get", "set", or "clear"',
          enum: ['get', 'set', 'clear'],
        },
        cookies: {
          type: 'array',
          description: 'Cookies to set (for action="set")',
        },
        url: {
          type: 'string',
          description: 'Filter cookies by URL',
        },
      },
      required: ['action'],
    },
  },
];

// ============================================================================
// Tool Detection & Execution
// ============================================================================

const BROWSER_TOOL_NAMES = new Set(BROWSER_TOOLS.map((t) => t.name));

export function isBrowserTool(toolName: string): boolean {
  return BROWSER_TOOL_NAMES.has(toolName);
}

export async function executeBrowserTool(
  agentId: string,
  toolCall: ToolCall
): Promise<{ success: boolean; output: string }> {
  const action = toolCall.name.replace('browser__', '');
  const input = toolCall.input;

  try {
    switch (action) {
      // ========== Configuration ==========
      case 'config': {
        const configAction = input.action as string;

        if (configAction === 'get') {
          return {
            success: true,
            output: JSON.stringify({
              headless: currentConfig.headless,
              cdpUrl: currentConfig.cdpUrl || '(not set)',
              viewport: currentConfig.viewport,
              timeout: currentConfig.timeout,
              slowMo: currentConfig.slowMo,
              browserConnected: browserInstance?.isConnected() || false,
            }, null, 2),
          };
        }

        if (configAction === 'set') {
          // Close existing browser if settings change
          const needsRestart =
            (input.headless !== undefined && input.headless !== currentConfig.headless) ||
            (input.cdp_url !== undefined && input.cdp_url !== currentConfig.cdpUrl);

          if (needsRestart && browserInstance) {
            await shutdownBrowser();
          }

          // Update config
          if (input.headless !== undefined) currentConfig.headless = input.headless as boolean;
          if (input.cdp_url !== undefined) currentConfig.cdpUrl = input.cdp_url as string || undefined;
          if (input.viewport_width) currentConfig.viewport.width = input.viewport_width as number;
          if (input.viewport_height) currentConfig.viewport.height = input.viewport_height as number;

          return {
            success: true,
            output: `Browser config updated. ${needsRestart ? 'Browser will restart on next action.' : ''}\n${JSON.stringify(currentConfig, null, 2)}`,
          };
        }

        return { success: false, output: 'Invalid action. Use "get" or "set".' };
      }

      // ========== Navigation ==========
      case 'navigate': {
        let url = input.url as string;
        if (!url) return { success: false, output: 'Missing url parameter' };
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }

        const page = await getAgentPage(agentId);
        const waitUntil = (input.wait_for as 'load' | 'domcontentloaded' | 'networkidle') || 'domcontentloaded';

        await page.goto(url, { waitUntil });

        const title = await page.title();
        const bodyText = await page.evaluate(() => {
          return document.body?.innerText?.slice(0, 3000) || '(empty page)';
        });

        logger.info('[browser-tools] navigate', { agentId, url, title });

        return {
          success: true,
          output: `Navigated to: ${page.url()}\nTitle: ${title}\n\n--- Page Content Preview ---\n${bodyText}`,
        };
      }

      case 'back': {
        const page = await getAgentPage(agentId);
        await page.goBack();
        return { success: true, output: `Navigated back to: ${page.url()}` };
      }

      case 'forward': {
        const page = await getAgentPage(agentId);
        await page.goForward();
        return { success: true, output: `Navigated forward to: ${page.url()}` };
      }

      case 'reload': {
        const page = await getAgentPage(agentId);
        await page.reload();
        return { success: true, output: `Reloaded: ${page.url()}` };
      }

      // ========== Interaction ==========
      case 'click': {
        const selector = input.selector as string;
        if (!selector) return { success: false, output: 'Missing selector parameter' };

        const page = await getAgentPage(agentId);
        const button = (input.button as 'left' | 'right' | 'middle') || 'left';
        const clickCount = (input.click_count as number) || 1;

        if (selector.startsWith('text:=')) {
          const text = selector.replace('text:=', '').replace(/"/g, '');
          await page.getByText(text, { exact: false }).first().click({ button, clickCount });
        } else {
          await page.click(selector, { button, clickCount });
        }

        await page.waitForTimeout(300);

        logger.info('[browser-tools] click', { agentId, selector });
        return { success: true, output: `Clicked: ${selector}\nCurrent URL: ${page.url()}` };
      }

      case 'type': {
        const selector = input.selector as string;
        const text = input.text as string;
        if (!selector) return { success: false, output: 'Missing selector' };
        if (text === undefined) return { success: false, output: 'Missing text' };

        const page = await getAgentPage(agentId);
        const delay = (input.delay as number) || 0;

        await page.fill(selector, '');
        await page.type(selector, text, { delay });

        if (input.press_enter) {
          await page.press(selector, 'Enter');
          await page.waitForTimeout(500);
        }

        return {
          success: true,
          output: `Typed "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}" into ${selector}`,
        };
      }

      case 'fill': {
        const selector = input.selector as string;
        const value = input.value as string;
        if (!selector || value === undefined) {
          return { success: false, output: 'Missing selector or value' };
        }

        const page = await getAgentPage(agentId);
        await page.fill(selector, value);

        return { success: true, output: `Filled ${selector} with "${value.slice(0, 50)}"` };
      }

      case 'select': {
        const selector = input.selector as string;
        if (!selector) return { success: false, output: 'Missing selector' };

        const page = await getAgentPage(agentId);

        if (input.value) {
          await page.selectOption(selector, { value: input.value as string });
        } else if (input.label) {
          await page.selectOption(selector, { label: input.label as string });
        } else {
          return { success: false, output: 'Provide either value or label' };
        }

        return { success: true, output: `Selected option in ${selector}` };
      }

      case 'hover': {
        const selector = input.selector as string;
        if (!selector) return { success: false, output: 'Missing selector' };

        const page = await getAgentPage(agentId);
        await page.hover(selector);

        return { success: true, output: `Hovering over ${selector}` };
      }

      case 'scroll': {
        const direction = input.direction as string;
        if (!direction) return { success: false, output: 'Missing direction' };

        const page = await getAgentPage(agentId);
        const amount = (input.amount as number) || 500;

        if (direction === 'to_element' && input.selector) {
          await page.locator(input.selector as string).scrollIntoViewIfNeeded();
          return { success: true, output: `Scrolled to ${input.selector}` };
        }

        const scrollMap: Record<string, [number, number]> = {
          up: [0, -amount],
          down: [0, amount],
          left: [-amount, 0],
          right: [amount, 0],
        };

        const [x, y] = scrollMap[direction] || [0, 0];
        await page.evaluate(({ x, y }) => window.scrollBy(x, y), { x, y });

        return { success: true, output: `Scrolled ${direction} by ${amount}px` };
      }

      case 'press_key': {
        const key = input.key as string;
        if (!key) return { success: false, output: 'Missing key' };

        const page = await getAgentPage(agentId);

        if (input.selector) {
          await page.press(input.selector as string, key);
        } else {
          await page.keyboard.press(key);
        }

        return { success: true, output: `Pressed key: ${key}` };
      }

      // ========== Content Extraction ==========
      case 'screenshot': {
        const page = await getAgentPage(agentId);

        const opts: any = {};
        if (input.full_page) opts.fullPage = true;
        if (input.quality) {
          opts.type = 'jpeg';
          opts.quality = input.quality as number;
        } else {
          opts.type = 'png';
        }

        let screenshot: Buffer;
        if (input.selector) {
          const element = await page.$(input.selector as string);
          if (!element) {
            return { success: false, output: `Element not found: ${input.selector}` };
          }
          screenshot = await element.screenshot(opts);
        } else {
          screenshot = await page.screenshot(opts);
        }

        const base64 = screenshot.toString('base64');
        const mimeType = opts.type === 'jpeg' ? 'image/jpeg' : 'image/png';

        logger.info('[browser-tools] screenshot', { agentId, bytes: screenshot.length });

        return {
          success: true,
          output: `Screenshot captured (${screenshot.length} bytes)\ndata:${mimeType};base64,${base64}`,
        };
      }

      case 'snapshot': {
        const page = await getAgentPage(agentId);
        const maxLength = (input.max_length as number) || 8000;
        const includeAttributes = (input.include_attributes as boolean) || false;

        // Use string evaluation to avoid __name issues from TypeScript/ESBuild
        const snapshotScript = `
          (function(maxLen, includeAttrs) {
            var parts = [];
            var totalLen = 0;

            function addPart(text) {
              if (totalLen + text.length > maxLen) return false;
              parts.push(text);
              totalLen += text.length;
              return true;
            }

            function getAttrs(el) {
              if (!includeAttrs) return '';
              var id = el.id ? '#' + el.id : '';
              var cls = el.className && typeof el.className === 'string'
                ? '.' + el.className.split(' ')[0]
                : '';
              return id + cls;
            }

            addPart('URL: ' + window.location.href);
            addPart('Title: ' + document.title);
            addPart('');

            // Headings
            var headings = document.querySelectorAll('h1, h2, h3, h4');
            if (headings.length > 0) {
              addPart('## Headings');
              for (var i = 0; i < headings.length && i < 15; i++) {
                var h = headings[i];
                var tag = h.tagName.toLowerCase();
                var text = (h.innerText || '').trim().slice(0, 100);
                addPart('  ' + tag + ': ' + text + ' ' + getAttrs(h));
              }
              addPart('');
            }

            // Buttons
            var buttons = document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]');
            if (buttons.length > 0) {
              addPart('## Buttons');
              for (var i = 0; i < buttons.length && i < 25; i++) {
                var b = buttons[i];
                var text = (b.innerText || '').trim() || b.value || b.getAttribute('aria-label') || '';
                addPart('  [' + text.slice(0, 40) + '] ' + getAttrs(b));
              }
              addPart('');
            }

            // Inputs
            var inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');
            if (inputs.length > 0) {
              addPart('## Inputs');
              for (var i = 0; i < inputs.length && i < 20; i++) {
                var el = inputs[i];
                var type = el.type || el.tagName.toLowerCase();
                var name = el.name || el.id || '';
                var placeholder = el.placeholder || '';
                addPart('  [' + type + '] name="' + name + '" placeholder="' + placeholder + '" ' + getAttrs(el));
              }
              addPart('');
            }

            // Links
            var links = document.querySelectorAll('a[href]');
            if (links.length > 0) {
              addPart('## Links');
              for (var i = 0; i < links.length && i < 30; i++) {
                var a = links[i];
                var text = (a.innerText || '').trim().slice(0, 50);
                var href = (a.href || '').slice(0, 80);
                if (text || href) {
                  addPart('  "' + text + '" → ' + href);
                }
              }
              addPart('');
            }

            // Content
            addPart('## Content');
            var main = document.querySelector('main, [role="main"], article, .content, #content, #main');
            var textSource = main || document.body;
            var bodyText = (textSource.innerText || '').trim();
            var remaining = maxLen - totalLen;
            addPart(bodyText.slice(0, remaining));

            return parts.join('\\n');
          })(${maxLength}, ${includeAttributes})
        `;

        const snapshot = await page.evaluate(snapshotScript);

        return { success: true, output: snapshot };
      }

      case 'get_text': {
        const selector = input.selector as string;
        if (!selector) return { success: false, output: 'Missing selector' };

        const page = await getAgentPage(agentId);
        const texts = await page.$$eval(selector, (elements) =>
          elements.map((el) => (el as HTMLElement).innerText?.trim()).filter(Boolean)
        );

        if (texts.length === 0) {
          return { success: false, output: `No elements found: ${selector}` };
        }

        return {
          success: true,
          output: `Found ${texts.length} element(s):\n\n${texts.join('\n---\n').slice(0, 10000)}`,
        };
      }

      case 'get_html': {
        const page = await getAgentPage(agentId);
        const outer = (input.outer as boolean) || false;

        let html: string;
        if (input.selector) {
          const element = await page.$(input.selector as string);
          if (!element) {
            return { success: false, output: `Element not found: ${input.selector}` };
          }
          html = outer
            ? await element.evaluate((el) => el.outerHTML)
            : await element.evaluate((el) => el.innerHTML);
        } else {
          html = await page.content();
        }

        return { success: true, output: html.slice(0, 50000) };
      }

      case 'get_attribute': {
        const selector = input.selector as string;
        const attribute = input.attribute as string;
        if (!selector || !attribute) {
          return { success: false, output: 'Missing selector or attribute' };
        }

        const page = await getAgentPage(agentId);
        const element = await page.$(selector);
        if (!element) {
          return { success: false, output: `Element not found: ${selector}` };
        }

        const value = await element.getAttribute(attribute);
        return { success: true, output: value || '(null)' };
      }

      // ========== JavaScript ==========
      case 'evaluate': {
        const script = input.script as string;
        if (!script) return { success: false, output: 'Missing script' };

        const page = await getAgentPage(agentId);
        const result = await page.evaluate(script);
        const output = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

        return { success: true, output: output?.slice(0, 10000) || '(undefined)' };
      }

      // ========== Waiting ==========
      case 'wait': {
        const page = await getAgentPage(agentId);
        const timeout = (input.timeout_ms as number) || 10000;

        if (input.navigation) {
          await page.waitForNavigation({ timeout });
          return { success: true, output: `Navigation completed: ${page.url()}` };
        }

        if (input.selector) {
          const state = (input.state as 'visible' | 'hidden' | 'attached' | 'detached') || 'visible';
          await page.waitForSelector(input.selector as string, { state, timeout });
          return { success: true, output: `Element ${state}: ${input.selector}` };
        }

        // Just wait for timeout
        await page.waitForTimeout(timeout);
        return { success: true, output: `Waited ${timeout}ms` };
      }

      // ========== Tabs ==========
      case 'tabs': {
        const context = agentContexts.get(agentId);
        if (!context) {
          return { success: true, output: 'No browser context active' };
        }

        const pages = context.pages();
        const tabs = await Promise.all(
          pages.map(async (p, i) => {
            const url = p.url();
            const title = await p.title().catch(() => '');
            const current = p === agentPages.get(agentId) ? ' (current)' : '';
            return `${i + 1}. ${title || '(untitled)'} - ${url}${current}`;
          })
        );

        return { success: true, output: `Open tabs:\n${tabs.join('\n')}` };
      }

      case 'new_tab': {
        const context = agentContexts.get(agentId);
        if (!context) {
          await getAgentPage(agentId);
        }

        const ctx = agentContexts.get(agentId)!;
        const newPage = await ctx.newPage();
        agentPages.set(agentId, newPage);

        if (input.url) {
          await newPage.goto(input.url as string);
        }

        return { success: true, output: `New tab opened${input.url ? `: ${input.url}` : ''}` };
      }

      case 'close_tab': {
        const page = agentPages.get(agentId);
        if (page && !page.isClosed()) {
          await page.close();
          agentPages.delete(agentId);
        }

        // Switch to another tab if available
        const context = agentContexts.get(agentId);
        if (context) {
          const pages = context.pages();
          if (pages.length > 0) {
            agentPages.set(agentId, pages[0]);
          }
        }

        return { success: true, output: 'Tab closed' };
      }

      // ========== Cookies ==========
      case 'cookies': {
        const cookieAction = input.action as string;
        const context = agentContexts.get(agentId);

        if (!context) {
          return { success: false, output: 'No browser context active' };
        }

        if (cookieAction === 'get') {
          const url = input.url as string | undefined;
          const cookies = url
            ? await context.cookies(url)
            : await context.cookies();
          return { success: true, output: JSON.stringify(cookies, null, 2) };
        }

        if (cookieAction === 'set' && input.cookies) {
          await context.addCookies(input.cookies as any[]);
          return { success: true, output: 'Cookies set' };
        }

        if (cookieAction === 'clear') {
          await context.clearCookies();
          return { success: true, output: 'Cookies cleared' };
        }

        return { success: false, output: 'Invalid cookie action' };
      }

      default:
        return { success: false, output: `Unknown browser action: ${action}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[browser-tools] error', { agentId, action, error: msg });
    return { success: false, output: `Browser error: ${msg}` };
  }
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Close browser context for an agent
 */
export async function closeAgentBrowser(agentId: string): Promise<void> {
  const page = agentPages.get(agentId);
  if (page && !page.isClosed()) {
    await page.close();
  }
  agentPages.delete(agentId);

  const context = agentContexts.get(agentId);
  if (context) {
    try {
      await context.close();
    } catch {
      // Ignore errors during cleanup
    }
  }
  agentContexts.delete(agentId);
}

/**
 * Shutdown browser (call on server shutdown)
 */
export async function shutdownBrowser(): Promise<void> {
  for (const [agentId] of agentContexts) {
    await closeAgentBrowser(agentId);
  }

  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {
      // Ignore
    }
    browserInstance = null;
    console.log('[browser-tools] Browser shut down');
  }
}

/**
 * Get current browser configuration (for API/status)
 */
export function getBrowserConfig(): BrowserConfig & { connected: boolean } {
  return {
    ...currentConfig,
    connected: browserInstance?.isConnected() || false,
  };
}

/**
 * Update browser configuration (for API)
 */
export function setBrowserConfig(config: Partial<BrowserConfig>): void {
  Object.assign(currentConfig, config);
}
