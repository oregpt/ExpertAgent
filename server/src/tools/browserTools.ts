/**
 * Browser Tools
 *
 * Headless browser automation via Playwright.
 * Gives agents the ability to navigate websites, interact with UIs,
 * take screenshots, and extract content from web pages.
 *
 * Browser contexts are persistent per-agent — cookies and sessions
 * survive across tool calls within the same agent session.
 *
 * Requires: playwright (npm install playwright)
 *
 * Tools:
 *   browser__navigate(url)                — navigate to a URL
 *   browser__click(selector, ref)         — click an element
 *   browser__type(selector, text)         — type into an input
 *   browser__screenshot()                 — capture a screenshot (returns base64)
 *   browser__snapshot()                   — get page accessibility tree (structured)
 *   browser__evaluate(script)             — run JavaScript in the page
 *   browser__get_text(selector)           — extract text content from element(s)
 *   browser__wait(selector, timeout)      — wait for an element to appear
 *
 * Gated by the `deepTools` feature flag (shares gate with web tools).
 */

import { Tool, ToolCall } from '../llm/types';

// Lazy-loaded Playwright types — only imported when first used
let pw: typeof import('playwright') | null = null;
let browserInstance: import('playwright').Browser | null = null;

// Per-agent browser contexts (persistent cookies/sessions)
const agentContexts = new Map<string, import('playwright').BrowserContext>();
const agentPages = new Map<string, import('playwright').Page>();

// ============================================================================
// Playwright Initialization (Lazy)
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

async function ensureBrowser(): Promise<import('playwright').Browser> {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;

  const playwright = await ensurePlaywright();
  browserInstance = await playwright.chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  console.log('[browser-tools] Chromium browser launched');
  return browserInstance;
}

/**
 * Get or create a persistent browser context + page for an agent.
 * Cookies and session state persist across calls.
 */
async function getAgentPage(agentId: string): Promise<import('playwright').Page> {
  // Return existing page if still open
  const existingPage = agentPages.get(agentId);
  if (existingPage && !existingPage.isClosed()) {
    return existingPage;
  }

  const browser = await ensureBrowser();

  // Get or create context (persistent cookies)
  let context = agentContexts.get(agentId);
  if (!context) {
    context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      // Accept cookies by default
      ignoreHTTPSErrors: true,
    });
    agentContexts.set(agentId, context);
    console.log(`[browser-tools] Created browser context for agent ${agentId}`);
  }

  // Create a new page in the context
  const page = await context.newPage();
  agentPages.set(agentId, page);

  // Set reasonable defaults
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);

  return page;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const BROWSER_TOOLS: Tool[] = [
  {
    name: 'browser__navigate',
    description:
      '[browser] Navigate to a URL. Returns the page title and a text snapshot of visible content.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to navigate to (must start with http:// or https://)',
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
    name: 'browser__click',
    description:
      '[browser] Click an element on the page. Use CSS selector or text content to identify the element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector (e.g. "button.submit", "#login-btn") or text:="Button Text"',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser__type',
    description:
      '[browser] Type text into an input field. Finds the element by selector, clears it, then types.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the input element',
        },
        text: {
          type: 'string',
          description: 'Text to type into the field',
        },
        press_enter: {
          type: 'boolean',
          description: 'Press Enter after typing (default: false)',
        },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'browser__screenshot',
    description:
      '[browser] Take a screenshot of the current page. Returns base64-encoded PNG.',
    inputSchema: {
      type: 'object',
      properties: {
        full_page: {
          type: 'boolean',
          description: 'Capture the full scrollable page (default: false, viewport only)',
        },
        selector: {
          type: 'string',
          description: 'CSS selector to screenshot a specific element (optional)',
        },
      },
    },
  },
  {
    name: 'browser__snapshot',
    description:
      '[browser] Get a structured text snapshot of the page. Extracts headings, links, buttons, inputs, and text content. Much cheaper than a screenshot for understanding page structure.',
    inputSchema: {
      type: 'object',
      properties: {
        max_length: {
          type: 'number',
          description: 'Max characters to return (default: 8000)',
        },
      },
    },
  },
  {
    name: 'browser__evaluate',
    description:
      '[browser] Execute JavaScript in the browser page context. Returns the result as a string.',
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'JavaScript code to execute in the page',
        },
      },
      required: ['script'],
    },
  },
  {
    name: 'browser__get_text',
    description:
      '[browser] Extract text content from elements matching a selector. Good for scraping specific data.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector to match elements',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser__wait',
    description:
      '[browser] Wait for an element to appear on the page. Use after navigation or clicks that trigger dynamic content.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector to wait for',
        },
        timeout_ms: {
          type: 'number',
          description: 'Max wait time in milliseconds (default: 10000)',
        },
      },
      required: ['selector'],
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
    const page = await getAgentPage(agentId);

    switch (action) {
      case 'navigate': {
        let url = input.url as string;
        if (!url) return { success: false, output: 'Missing url parameter' };
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }

        const waitUntil = (input.wait_for as string) || 'domcontentloaded';
        await page.goto(url, {
          waitUntil: waitUntil as 'load' | 'domcontentloaded' | 'networkidle',
        });

        const title = await page.title();
        // Get a quick text snapshot
        const bodyText = await page.evaluate(() => {
          const body = document.body;
          if (!body) return '(empty page)';
          // Get visible text, trimmed
          return body.innerText.slice(0, 3000);
        });

        return {
          success: true,
          output: `Navigated to: ${page.url()}\nTitle: ${title}\n\n--- Page Content Preview ---\n${bodyText}`,
        };
      }

      case 'click': {
        const selector = input.selector as string;
        if (!selector) return { success: false, output: 'Missing selector parameter' };

        // Support text:= syntax for clicking by visible text
        if (selector.startsWith('text:=')) {
          const text = selector.replace('text:=', '').replace(/"/g, '');
          await page.getByText(text, { exact: false }).first().click();
        } else {
          await page.click(selector);
        }

        // Brief wait for any navigation/rendering
        await page.waitForTimeout(500);

        return {
          success: true,
          output: `Clicked: ${selector}\nCurrent URL: ${page.url()}`,
        };
      }

      case 'type': {
        const selector = input.selector as string;
        const text = input.text as string;
        if (!selector) return { success: false, output: 'Missing selector parameter' };
        if (text === undefined) return { success: false, output: 'Missing text parameter' };

        // Clear existing content first
        await page.fill(selector, '');
        await page.type(selector, text);

        if (input.press_enter) {
          await page.press(selector, 'Enter');
          await page.waitForTimeout(500);
        }

        return {
          success: true,
          output: `Typed "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}" into ${selector}${input.press_enter ? ' (+ Enter)' : ''}`,
        };
      }

      case 'screenshot': {
        const opts: any = { type: 'png' };
        if (input.full_page) opts.fullPage = true;

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
        return {
          success: true,
          output: `Screenshot captured (${screenshot.length} bytes, ${base64.length} base64 chars).\nBase64: data:image/png;base64,${base64.slice(0, 200)}... [truncated for display — full image available in tool result]`,
        };
      }

      case 'snapshot': {
        const maxLength = (input.max_length as number) || 8000;

        // Build a structured snapshot of the page
        const snapshot = await page.evaluate((maxLen: number) => {
          const parts: string[] = [];
          let totalLen = 0;

          function addPart(text: string) {
            if (totalLen + text.length > maxLen) return false;
            parts.push(text);
            totalLen += text.length;
            return true;
          }

          // URL and title
          addPart(`URL: ${window.location.href}`);
          addPart(`Title: ${document.title}`);
          addPart('');

          // Headings
          const headings = document.querySelectorAll('h1, h2, h3');
          if (headings.length > 0) {
            addPart('## Headings');
            headings.forEach((h) => {
              const tag = h.tagName.toLowerCase();
              addPart(`  ${tag}: ${(h as HTMLElement).innerText.trim().slice(0, 100)}`);
            });
            addPart('');
          }

          // Interactive elements (buttons, links, inputs)
          const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"]');
          if (buttons.length > 0) {
            addPart('## Buttons');
            buttons.forEach((b, i) => {
              if (i >= 20) return;
              const text = (b as HTMLElement).innerText?.trim() || (b as HTMLInputElement).value || '';
              const id = b.id ? `#${b.id}` : '';
              const cls = b.className ? `.${(b.className as string).split(' ')[0]}` : '';
              addPart(`  [${text.slice(0, 40)}] ${id}${cls}`);
            });
            addPart('');
          }

          const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), textarea, select');
          if (inputs.length > 0) {
            addPart('## Inputs');
            inputs.forEach((inp, i) => {
              if (i >= 15) return;
              const el = inp as HTMLInputElement;
              const type = el.type || el.tagName.toLowerCase();
              const name = el.name || el.id || '';
              const placeholder = el.placeholder || '';
              const value = el.value?.slice(0, 30) || '';
              addPart(`  [${type}] name="${name}" placeholder="${placeholder}" value="${value}"`);
            });
            addPart('');
          }

          const links = document.querySelectorAll('a[href]');
          if (links.length > 0) {
            addPart('## Links');
            links.forEach((a, i) => {
              if (i >= 25) return;
              const text = (a as HTMLElement).innerText?.trim().slice(0, 50) || '';
              const href = (a as HTMLAnchorElement).href?.slice(0, 80) || '';
              if (text || href) {
                addPart(`  "${text}" → ${href}`);
              }
            });
            addPart('');
          }

          // Main text content
          addPart('## Content');
          const main = document.querySelector('main, [role="main"], article, .content, #content');
          const textSource = main || document.body;
          const bodyText = (textSource as HTMLElement).innerText?.trim() || '';
          const remaining = maxLen - totalLen;
          addPart(bodyText.slice(0, remaining));

          return parts.join('\n');
        }, maxLength);

        return {
          success: true,
          output: snapshot,
        };
      }

      case 'evaluate': {
        const script = input.script as string;
        if (!script) return { success: false, output: 'Missing script parameter' };

        const result = await page.evaluate(script);
        const output = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        return {
          success: true,
          output: output?.slice(0, 10000) || '(undefined)',
        };
      }

      case 'get_text': {
        const selector = input.selector as string;
        if (!selector) return { success: false, output: 'Missing selector parameter' };

        const texts = await page.$$eval(selector, (elements) =>
          elements.map((el) => (el as HTMLElement).innerText?.trim()).filter(Boolean)
        );

        if (texts.length === 0) {
          return { success: false, output: `No elements found matching: ${selector}` };
        }

        return {
          success: true,
          output: `Found ${texts.length} element(s):\n\n${texts.join('\n---\n').slice(0, 10000)}`,
        };
      }

      case 'wait': {
        const selector = input.selector as string;
        if (!selector) return { success: false, output: 'Missing selector parameter' };

        const timeout = (input.timeout_ms as number) || 10000;
        await page.waitForSelector(selector, { timeout });

        return {
          success: true,
          output: `Element appeared: ${selector}`,
        };
      }

      default:
        return { success: false, output: `Unknown browser action: ${action}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: `Browser tool error: ${msg}` };
  }
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Close browser context for an agent (call on session end or cleanup)
 */
export async function closeAgentBrowser(agentId: string): Promise<void> {
  const page = agentPages.get(agentId);
  if (page && !page.isClosed()) {
    await page.close();
  }
  agentPages.delete(agentId);

  const context = agentContexts.get(agentId);
  if (context) {
    await context.close();
  }
  agentContexts.delete(agentId);
}

/**
 * Shutdown the shared browser instance (call on server shutdown)
 */
export async function shutdownBrowser(): Promise<void> {
  // Close all contexts
  for (const [agentId] of agentContexts) {
    await closeAgentBrowser(agentId);
  }

  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    console.log('[browser-tools] Browser shut down');
  }
}
