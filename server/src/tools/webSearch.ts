/**
 * Web Search Tool
 *
 * Tool that the LLM can call to search the web via Brave Search API.
 * Follows the same pattern as memoryTools.ts.
 *
 * Tools:
 *   web__search(query, count?) — search the web and return results
 */

import axios from 'axios';
import { Tool } from '../llm/types';

// ============================================================================
// Tool Definition (LLM schema)
// ============================================================================

export const WEB_SEARCH_TOOL: Tool = {
  name: 'web__search',
  description: '[web] Search the web using Brave Search. Returns titles, URLs, and snippets for the top results.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query string',
      },
      count: {
        type: 'number',
        description: 'Number of results to return (default 5, max 10)',
      },
    },
    required: ['query'],
  },
};

// ============================================================================
// Types
// ============================================================================

interface BraveSearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
}

interface BraveSearchResponse {
  web?: {
    results?: BraveWebResult[];
  };
}

// ============================================================================
// Tool Execution
// ============================================================================

/**
 * Execute web search via Brave Search API
 */
export async function executeWebSearch(
  input: Record<string, unknown>
): Promise<{ success: boolean; output: string }> {
  const query = input.query as string;
  if (!query) {
    return { success: false, output: 'Missing query parameter' };
  }

  const count = Math.min(Math.max((input.count as number) || 5, 1), 10);

  // Check for API key
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      output: 'Web search not configured — BRAVE_API_KEY not set. Ask your administrator to configure the Brave Search API key.',
    };
  }

  try {
    console.log(`[web__search] Searching: "${query}" (count=${count})`);

    const response = await axios.get<BraveSearchResponse>(
      'https://api.search.brave.com/res/v1/web/search',
      {
        params: {
          q: query,
          count,
        },
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
        timeout: 10000,
      }
    );

    const webResults = response.data?.web?.results || [];
    const results: BraveSearchResult[] = webResults.map((r: BraveWebResult) => ({
      title: r.title || '(no title)',
      url: r.url || '',
      snippet: r.description || '(no description)',
    }));

    console.log(`[web__search] Got ${results.length} results for "${query}"`);

    if (results.length === 0) {
      return { success: true, output: `No results found for "${query}".` };
    }

    // Format results for LLM consumption
    const formatted = results
      .map((r, i) => `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    ${r.snippet}`)
      .join('\n\n');

    return {
      success: true,
      output: `Found ${results.length} results for "${query}":\n\n${formatted}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[web__search] Error searching "${query}":`, msg);
    return { success: false, output: `Web search error: ${msg}` };
  }
}
