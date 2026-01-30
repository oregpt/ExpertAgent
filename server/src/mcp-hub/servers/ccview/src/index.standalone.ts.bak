#!/usr/bin/env node
/**
 * ccview.io MCP Server
 * 
 * An MCP server for interacting with the Canton Network Explorer API
 * 
 * Author: Ore Phillips (oregpt)
 * License: MIT
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { CcviewApiClient } from './api-client.js';
import { TOOLS, getToolCounts, ToolDefinition } from './tools.js';

// Get API key from environment
const API_KEY = process.env.CCVIEW_API_KEY;
if (!API_KEY) {
  console.error('Error: CCVIEW_API_KEY environment variable is required');
  console.error('Get your API key from https://ccview.io');
  process.exit(1);
}

// Initialize API client
const api = new CcviewApiClient({ apiKey: API_KEY });

// Initialize MCP server
const server = new Server(
  {
    name: 'ccview-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const counts = getToolCounts();
  
  return {
    tools: TOOLS.map(tool => ({
      name: tool.name,
      description: formatDescription(tool),
      inputSchema: tool.inputSchema,
    })),
  };
});

// Format tool description with status
function formatDescription(tool: ToolDefinition): string {
  const statusPrefix = {
    stable: '',
    experimental: '⚠️ [EXPERIMENTAL] ',
    deprecated: '❌ [DEPRECATED] '
  };
  return `${statusPrefix[tool.status]}${tool.description}`;
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  // Find the tool definition
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  // Warn about deprecated tools
  if (tool.status === 'deprecated') {
    console.error(`Warning: Tool '${name}' is deprecated and may not work`);
  }

  try {
    // Build the endpoint URL with path params
    let endpoint = tool.endpoint;
    const queryParams: Record<string, string | number | undefined> = {};

    // Replace path parameters and collect query params
    if (args) {
      for (const [key, value] of Object.entries(args)) {
        if (endpoint.includes(`{${key}}`)) {
          endpoint = endpoint.replace(`{${key}}`, String(value));
        } else {
          queryParams[key] = value as string | number;
        }
      }
    }

    // Make the API request
    const response = await api.request(endpoint, queryParams, tool.version);

    if (response.error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: response.error,
            tool: name,
            status: tool.status,
            hint: tool.status === 'deprecated' 
              ? 'This endpoint may no longer be available in the API'
              : tool.status === 'experimental'
              ? 'This endpoint may require specific parameters'
              : undefined
          }, null, 2)
        }],
        isError: true,
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
          tool: name,
        }, null, 2)
      }],
      isError: true,
    };
  }
});

// List resources (API documentation)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'ccview://api-status',
        name: 'API Status',
        description: 'Overview of ccview.io API endpoint statuses',
        mimeType: 'application/json',
      },
      {
        uri: 'ccview://tools-by-category',
        name: 'Tools by Category',
        description: 'List of all tools organized by category',
        mimeType: 'application/json',
      },
    ],
  };
});

// Read resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'ccview://api-status') {
    const counts = getToolCounts();
    const byStatus = {
      stable: TOOLS.filter(t => t.status === 'stable').map(t => t.name),
      experimental: TOOLS.filter(t => t.status === 'experimental').map(t => t.name),
      deprecated: TOOLS.filter(t => t.status === 'deprecated').map(t => t.name),
    };

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          summary: counts,
          endpoints: byStatus,
          legend: {
            stable: 'Tested and working reliably',
            experimental: 'Works but may need specific parameters',
            deprecated: 'Returns 404, likely removed from API'
          }
        }, null, 2)
      }]
    };
  }

  if (uri === 'ccview://tools-by-category') {
    const categories: Record<string, string[]> = {};
    for (const tool of TOOLS) {
      if (!categories[tool.category]) {
        categories[tool.category] = [];
      }
      const prefix = tool.status === 'stable' ? '✅' : tool.status === 'experimental' ? '⚠️' : '❌';
      categories[tool.category].push(`${prefix} ${tool.name}`);
    }

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(categories, null, 2)
      }]
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  const counts = getToolCounts();
  console.error(`ccview.io MCP Server started`);
  console.error(`Tools: ${counts.stable} stable, ${counts.experimental} experimental, ${counts.deprecated} deprecated`);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
