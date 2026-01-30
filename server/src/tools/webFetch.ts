/**
 * Web Fetch Tool
 *
 * Tool that the LLM can call to fetch a URL and extract readable text content.
 * Uses axios + simple HTML stripping — no heavy dependencies.
 * Follows the same pattern as memoryTools.ts.
 *
 * Tools:
 *   web__fetch(url, maxChars?) — fetch URL and extract readable content
 */

import axios from 'axios';
import { Tool } from '../llm/types';

// ============================================================================
// Tool Definition (LLM schema)
// ============================================================================

export const WEB_FETCH_TOOL: Tool = {
  name: 'web__fetch',
  description: '[web] Fetch a URL and extract readable text content. Strips HTML tags, scripts, and styles. Useful for reading web pages, documentation, articles.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'HTTP or HTTPS URL to fetch',
      },
      maxChars: {
        type: 'number',
        description: 'Maximum characters to return (default 10000)',
      },
    },
    required: ['url'],
  },
};

// ============================================================================
// HTML-to-Text Extraction
// ============================================================================

/**
 * Extract the <title> from HTML
 */
function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtmlEntities(match[1]!.trim()) : '';
}

/**
 * Decode basic HTML entities
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Strip HTML and extract readable text content.
 * Simple regex/string approach — no heavy libraries needed.
 */
function htmlToText(html: string): string {
  let text = html;

  // Remove entire blocks we don't want
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Add line breaks for block elements
  text = text.replace(/<\/?(h[1-6]|p|div|section|article|main|li|tr|br|hr)[^>]*>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  // Clean up whitespace
  // Collapse multiple spaces on same line
  text = text.replace(/[ \t]+/g, ' ');
  // Collapse multiple newlines
  text = text.replace(/\n\s*\n/g, '\n\n');
  // Trim each line
  text = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');

  return text.trim();
}

// ============================================================================
// Tool Execution
// ============================================================================

/**
 * Execute web fetch — download a URL and extract readable text
 */
export async function executeWebFetch(
  input: Record<string, unknown>
): Promise<{ success: boolean; output: string }> {
  const url = input.url as string;
  if (!url) {
    return { success: false, output: 'Missing url parameter' };
  }

  // Validate URL format
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { success: false, output: 'Invalid URL — must start with http:// or https://' };
  }

  const maxChars = Math.max((input.maxChars as number) || 10000, 500);

  try {
    console.log(`[web__fetch] Fetching: ${url} (maxChars=${maxChars})`);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'AgentInABox/2.0 (Web Fetch Tool)',
        'Accept': 'text/html,application/xhtml+xml,text/plain,*/*',
      },
      timeout: 15000,
      maxRedirects: 5,
      responseType: 'text',
      // Limit download size to ~2MB to prevent abuse
      maxContentLength: 2 * 1024 * 1024,
    });

    const html = typeof response.data === 'string' ? response.data : String(response.data);
    const title = extractTitle(html);
    let content = htmlToText(html);

    // Truncate if needed
    const truncated = content.length > maxChars;
    if (truncated) {
      content = content.slice(0, maxChars) + '\n\n[CONTENT TRUNCATED]';
    }

    console.log(`[web__fetch] Extracted ${content.length} chars from ${url} (truncated=${truncated})`);

    // Format result for LLM consumption
    const result = {
      url,
      title: title || '(no title)',
      content,
      truncated,
    };

    return {
      success: true,
      output: `Title: ${result.title}\nURL: ${result.url}\nTruncated: ${result.truncated}\n\n${result.content}`,
    };
  } catch (err) {
    let msg: string;
    if (axios.isAxiosError(err)) {
      if (err.response) {
        msg = `HTTP ${err.response.status}: ${err.response.statusText}`;
      } else if (err.code === 'ECONNABORTED') {
        msg = 'Request timed out';
      } else {
        msg = err.message;
      }
    } else {
      msg = err instanceof Error ? err.message : String(err);
    }

    console.error(`[web__fetch] Error fetching ${url}:`, msg);
    return { success: false, output: `Web fetch error: ${msg}` };
  }
}
